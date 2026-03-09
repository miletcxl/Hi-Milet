import path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { SqliteStore } from './storage/sqliteStore.js';
import { WindowsDpapiSecretProvider } from './services/windowsDpapiSecretProvider.js';
import { PermissionService } from './services/permissionService.js';
import { ReminderService } from './services/reminderService.js';
import { ToolRuntime } from './services/toolRuntime.js';
import { LlmClient } from './services/llmClient.js';
import { StreamManager } from './services/streamManager.js';
import { ChatOrchestrator } from './services/chatOrchestrator.js';
import { createHttpApp } from './http/routes.js';
import { makeEnvelope, parseEnvelope } from './utils/envelope.js';
import {
  EnvelopeTypes,
  type ApprovalRequestPayload,
  type PetSpeakPayload,
  type PetStatePayload,
} from './types/protocol.js';

const WS_PORT = Number(process.env.HIMILET_WS_PORT ?? 18789);
const HTTP_PORT = Number(process.env.HIMILET_HTTP_PORT ?? 18790);
const HOST = process.env.HIMILET_HOST ?? '127.0.0.1';

const ChatUserSchema = z.object({
  conversation_id: z.string().min(1),
  message_id: z.string().min(1),
  text: z.string().min(1),
});

const ChatContinueSchema = z.object({
  conversation_id: z.string().min(1),
  parent_message_id: z.string().min(1),
});

const ApprovalResultSchema = z.object({
  request_id: z.string().min(1),
  decision: z.enum(['allow', 'deny']),
  note: z.string().optional(),
});

interface ClientConnection {
  connectionId: string;
  socket: WebSocket;
  sessionId?: string;
}

interface PendingApproval {
  resolve: (decision: boolean) => void;
  timer: NodeJS.Timeout;
}

async function bootstrap() {
  const dataDir = path.resolve(process.cwd(), 'backend', 'himilet-gateway', 'data');
  const store = await SqliteStore.create(dataDir);
  const secretProvider = new WindowsDpapiSecretProvider();
  const permissionService = new PermissionService(store);

  const connections = new Map<string, ClientConnection>();
  const sessionToConnectionId = new Map<string, string>();
  const pendingApprovals = new Map<string, PendingApproval>();
  const lastPetStateBySession = new Map<string, PetStatePayload>();

  const sendEnvelopeToSession = async (sessionId: string, type: string, payload: Record<string, unknown>) => {
    const connectionId = sessionToConnectionId.get(sessionId);
    if (!connectionId) {
      return;
    }
    const conn = connections.get(connectionId);
    if (!conn || conn.socket.readyState !== conn.socket.OPEN) {
      return;
    }

    conn.socket.send(JSON.stringify(makeEnvelope(type, sessionId, payload)));
  };

  const sendPetStateToSession = async (sessionId: string, payload: PetStatePayload) => {
    lastPetStateBySession.set(sessionId, payload);
    await sendEnvelopeToSession(sessionId, EnvelopeTypes.PetState, payload as unknown as Record<string, unknown>);
  };

  const requestApproval = async (
    sessionId: string,
    req: { command: string; reason: string; riskLevel: string; timeoutMs: number },
  ) => {
    const requestId = randomUUID().replaceAll('-', '');
    await sendEnvelopeToSession(sessionId, EnvelopeTypes.ApprovalRequest, {
      request_id: requestId,
      command: req.command,
      reason: req.reason,
      risk_level: req.riskLevel,
      timeout_ms: req.timeoutMs,
    } satisfies ApprovalRequestPayload);

    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        pendingApprovals.delete(requestId);
        resolve(false);
      }, req.timeoutMs);

      pendingApprovals.set(requestId, { resolve, timer });
    });
  };

  const reminderService = new ReminderService(store, async (reminder) => {
    for (const sessionId of sessionToConnectionId.keys()) {
      await sendEnvelopeToSession(sessionId, EnvelopeTypes.SystemNotice, {
        message: `提醒：${reminder.message}`,
        level: 'info',
      });
      await sendEnvelopeToSession(sessionId, EnvelopeTypes.PetSpeak, {
        text: reminder.message,
        stream: false,
      } satisfies PetSpeakPayload);
      await sendPetStateToSession(sessionId, { state: 'Idle', reason: 'reminder_sent' });
    }
  });

  const toolRuntime = new ToolRuntime(reminderService, permissionService, store, requestApproval);
  const llmClient = new LlmClient();
  const streamManager = new StreamManager();
  const chatOrchestrator = new ChatOrchestrator(store, llmClient, toolRuntime, streamManager, {
    sendAssistant: async (sessionId, payload) => {
      await sendEnvelopeToSession(sessionId, EnvelopeTypes.ChatAssistant, payload as unknown as Record<string, unknown>);
    },
    sendPetState: async (sessionId, payload) => {
      await sendPetStateToSession(sessionId, payload);
    },
    getActiveProfile: async () => {
      const profile = store.getActiveLlmProfile();
      if (!profile || !profile.encrypted_key) {
        return null;
      }
      const apiKey = await secretProvider.decrypt(profile.encrypted_key);
      return { profile, apiKey };
    },
  });

  await reminderService.bootstrap();

  const wsServer = new WebSocketServer({ host: HOST, port: WS_PORT });
  wsServer.on('connection', (socket) => {
    const connectionId = randomUUID().replaceAll('-', '');
    const conn: ClientConnection = { connectionId, socket };
    connections.set(connectionId, conn);

    socket.on('message', (raw) => {
      void handleWsMessage(String(raw), conn);
    });

    socket.on('close', () => {
      void handleWsClose(conn);
    });
  });

  async function handleWsMessage(raw: string, conn: ClientConnection): Promise<void> {
    const envelope = parseEnvelope(raw);
    if (!envelope) {
      return;
    }

    const previousConnectionId = sessionToConnectionId.get(envelope.session_id);
    conn.sessionId = envelope.session_id;
    sessionToConnectionId.set(envelope.session_id, conn.connectionId);
    if (previousConnectionId && previousConnectionId !== conn.connectionId) {
      await chatOrchestrator.onConnectionClosed(envelope.session_id);
    }

    const lastState = lastPetStateBySession.get(envelope.session_id);
    if (lastState) {
      await sendPetStateToSession(envelope.session_id, lastState);
    }

    if (envelope.type === EnvelopeTypes.ChatUser) {
      const payload = ChatUserSchema.safeParse(envelope.payload);
      if (!payload.success) {
        return;
      }

      await chatOrchestrator.startStream({
        sessionId: envelope.session_id,
        connectionId: conn.connectionId,
        conversationId: payload.data.conversation_id,
        userText: payload.data.text,
      });
      return;
    }

    if (envelope.type === EnvelopeTypes.ChatContinue) {
      const payload = ChatContinueSchema.safeParse(envelope.payload);
      if (!payload.success) {
        return;
      }

      await chatOrchestrator.startStream({
        sessionId: envelope.session_id,
        connectionId: conn.connectionId,
        conversationId: payload.data.conversation_id,
        continueParentMessageId: payload.data.parent_message_id,
      });
      return;
    }

    if (envelope.type === EnvelopeTypes.ApprovalResult) {
      const payload = ApprovalResultSchema.safeParse(envelope.payload);
      if (!payload.success) {
        return;
      }
      const pending = pendingApprovals.get(payload.data.request_id);
      if (!pending) {
        return;
      }

      pendingApprovals.delete(payload.data.request_id);
      clearTimeout(pending.timer);
      pending.resolve(payload.data.decision === 'allow');
      return;
    }
  }

  async function handleWsClose(conn: ClientConnection): Promise<void> {
    connections.delete(conn.connectionId);
    if (!conn.sessionId) {
      return;
    }

    if (sessionToConnectionId.get(conn.sessionId) === conn.connectionId) {
      sessionToConnectionId.delete(conn.sessionId);
    }
    await chatOrchestrator.onConnectionClosed(conn.sessionId);
    lastPetStateBySession.set(conn.sessionId, { state: 'Idle', reason: 'reconnect_cleanup' });
  }

  const app = createHttpApp(store, permissionService, secretProvider, reminderService);
  const httpServer = http.createServer(app);
  httpServer.listen(HTTP_PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[himilet-gateway] HTTP listening at http://${HOST}:${HTTP_PORT}`);
  });

  // eslint-disable-next-line no-console
  console.log(`[himilet-gateway] WS listening at ws://${HOST}:${WS_PORT}`);
}

void bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[himilet-gateway] fatal:', error);
  process.exitCode = 1;
});
