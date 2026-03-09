import { randomUUID } from 'node:crypto';
import type { ChatMessageRow, LlmProfile } from '../types/domain.js';
import type { ChatAssistantPayload, PetStatePayload } from '../types/protocol.js';
import { SqliteStore } from '../storage/sqliteStore.js';
import { LlmClient, type LlmMessage } from './llmClient.js';
import { ToolRuntime } from './toolRuntime.js';
import { StreamManager } from './streamManager.js';

interface StartStreamParams {
  sessionId: string;
  connectionId: string;
  conversationId: string;
  userText?: string;
  continueParentMessageId?: string;
}

interface StartStreamCallbacks {
  sendAssistant: (sessionId: string, payload: ChatAssistantPayload) => Promise<void>;
  sendPetState: (sessionId: string, payload: PetStatePayload) => Promise<void>;
  getActiveProfile: () => Promise<{ profile: LlmProfile; apiKey: string } | null>;
}

interface ConversationState {
  messages: LlmMessage[];
  assistantTextByMessageId: Map<string, string>;
  seqByMessageId: Map<string, number>;
}

export class ChatOrchestrator {
  private readonly states = new Map<string, ConversationState>();

  constructor(
    private readonly store: SqliteStore,
    private readonly llmClient: LlmClient,
    private readonly toolRuntime: ToolRuntime,
    private readonly streamManager: StreamManager,
    private readonly callbacks: StartStreamCallbacks,
  ) {}

  async onConnectionClosed(sessionId: string): Promise<void> {
    await this.streamManager.cancelBySession(sessionId, 'connection_closed');
  }

  async startStream(input: StartStreamParams): Promise<void> {
    const active = await this.callbacks.getActiveProfile();
    if (!active) {
      await this.callbacks.sendAssistant(input.sessionId, {
        conversation_id: input.conversationId,
        message_id: randomUUID().replaceAll('-', ''),
        text: '尚未配置可用的 LLM Profile。',
        stream_id: randomUUID().replaceAll('-', ''),
        seq: 0,
        is_final: true,
      });
      await this.callbacks.sendPetState(input.sessionId, { state: 'Idle', reason: 'no_profile' });
      return;
    }

    const { profile, apiKey } = active;
    const state = this.getState(input.conversationId);
    const nowIso = new Date().toISOString();
    await this.store.upsertConversation(input.conversationId, nowIso);

    if (input.userText) {
      state.messages.push({ role: 'user', content: input.userText });
      await this.store.upsertMessage({
        id: randomUUID().replaceAll('-', ''),
        conversation_id: input.conversationId,
        role: 'user',
        content: input.userText,
        seq: 0,
        is_final: true,
        interrupted: false,
        created_at: nowIso,
      });
    } else if (input.continueParentMessageId) {
      state.messages.push({
        role: 'user',
        content: 'Please continue the previous answer from where it was interrupted.',
      });
    }

    const streamId = randomUUID().replaceAll('-', '');
    const assistantMessageId = input.continueParentMessageId ?? randomUUID().replaceAll('-', '');
    const abortController = new AbortController();
    let finalized = false;

    const finalizeOnce = async (interrupted: boolean): Promise<void> => {
      if (finalized) {
        return;
      }

      finalized = true;
      await this.finishAssistantMessage(input.sessionId, input.conversationId, assistantMessageId, streamId, interrupted);
    };

    const shouldAcceptChunk = () =>
      this.streamManager.isCurrent(input.sessionId, streamId, input.connectionId) && !abortController.signal.aborted;

    this.streamManager.start({
      streamId,
      sessionId: input.sessionId,
      connectionId: input.connectionId,
      conversationId: input.conversationId,
      assistantMessageId,
      abortController,
      markInterrupted: async () => {
        await finalizeOnce(true);
      },
    });

    await this.callbacks.sendPetState(input.sessionId, { state: 'Thinking', reason: 'llm_processing' });

    try {
      const completion = await this.llmClient.completeWithTools(
        profile,
        apiKey,
        state.messages,
        this.toolRuntime.getToolDefinitions(),
        abortController.signal,
      );

      if (completion.toolCalls.length > 0) {
        await this.callbacks.sendPetState(input.sessionId, { state: 'Work', reason: 'tool_execution' });
        for (const toolCall of completion.toolCalls) {
          const toolResult = await this.toolRuntime.executeTool(toolCall.name, toolCall.arguments, {
            sessionId: input.sessionId,
          });
          state.messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
            name: toolCall.name,
          });
        }
      }

      let aggregated = '';
      let seq = state.seqByMessageId.get(assistantMessageId) ?? -1;

      if (!completion.toolCalls.length && completion.content) {
        for (const chunk of this.chunkText(completion.content)) {
          if (!shouldAcceptChunk()) {
            throw new Error('aborted');
          }
          seq += 1;
          aggregated += chunk;
          state.seqByMessageId.set(assistantMessageId, seq);
          state.assistantTextByMessageId.set(assistantMessageId, aggregated);
          await this.callbacks.sendAssistant(input.sessionId, {
            conversation_id: input.conversationId,
            message_id: assistantMessageId,
            text: chunk,
            stream_id: streamId,
            seq,
            is_final: false,
          });
        }
      } else {
        await this.llmClient.streamText(profile, apiKey, state.messages, abortController.signal, (delta) => {
          if (!shouldAcceptChunk()) {
            return;
          }
          seq += 1;
          aggregated += delta;
          state.seqByMessageId.set(assistantMessageId, seq);
          state.assistantTextByMessageId.set(assistantMessageId, aggregated);
          void this.callbacks.sendAssistant(input.sessionId, {
            conversation_id: input.conversationId,
            message_id: assistantMessageId,
            text: delta,
            stream_id: streamId,
            seq,
            is_final: false,
          });
        });
      }

      state.messages.push({ role: 'assistant', content: state.assistantTextByMessageId.get(assistantMessageId) ?? '' });
      await finalizeOnce(false);
      this.streamManager.complete(input.sessionId, streamId);
    } catch (error) {
      if (!abortController.signal.aborted) {
        await this.callbacks.sendAssistant(input.sessionId, {
          conversation_id: input.conversationId,
          message_id: assistantMessageId,
          text: `模型调用失败：${error instanceof Error ? error.message : String(error)}`,
          stream_id: streamId,
          seq: (state.seqByMessageId.get(assistantMessageId) ?? -1) + 1,
          is_final: true,
        });
      } else {
        await finalizeOnce(true);
      }
      this.streamManager.complete(input.sessionId, streamId);
    } finally {
      await this.callbacks.sendPetState(input.sessionId, { state: 'Idle', reason: 'stream_complete' });
    }
  }

  private getState(conversationId: string): ConversationState {
    const existing = this.states.get(conversationId);
    if (existing) {
      return existing;
    }

    const rows = this.store.listConversationMessages(conversationId);
    const messages: LlmMessage[] = rows.map((r) => ({
      role: r.role,
      content: r.content,
    }));
    const state: ConversationState = {
      messages,
      assistantTextByMessageId: new Map(
        rows.filter((r) => r.role === 'assistant').map((r) => [r.id, r.content]),
      ),
      seqByMessageId: new Map(
        rows.filter((r) => r.role === 'assistant').map((r) => [r.id, r.seq]),
      ),
    };
    this.states.set(conversationId, state);
    return state;
  }

  private async finishAssistantMessage(
    sessionId: string,
    conversationId: string,
    messageId: string,
    streamId: string,
    interrupted: boolean,
  ): Promise<void> {
    const state = this.getState(conversationId);
    const seq = state.seqByMessageId.get(messageId) ?? 0;
    const content = state.assistantTextByMessageId.get(messageId) ?? '';

    await this.callbacks.sendAssistant(sessionId, {
      conversation_id: conversationId,
      message_id: messageId,
      text: '',
      stream_id: streamId,
      seq: seq + 1,
      is_final: true,
      interrupted,
    });

    const row: ChatMessageRow = {
      id: messageId,
      conversation_id: conversationId,
      role: 'assistant',
      content,
      stream_id: streamId,
      seq: seq + 1,
      is_final: true,
      interrupted,
      created_at: new Date().toISOString(),
    };
    await this.store.upsertMessage(row);
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const ch of text) {
      current += ch;
      if (current.length >= 18) {
        chunks.push(current);
        current = '';
      }
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    return chunks;
  }
}
