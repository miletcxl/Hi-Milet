import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PermissionService } from './permissionService.js';
import { ReminderService } from './reminderService.js';
import { SqliteStore } from '../storage/sqliteStore.js';

interface ToolContext {
  sessionId: string;
}

interface ApprovalRequest {
  command: string;
  reason: string;
  riskLevel: string;
  timeoutMs: number;
}

export type ToolResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

export class ToolRuntime {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly permissionService: PermissionService,
    private readonly store: SqliteStore,
    private readonly requestApproval: (sessionId: string, req: ApprovalRequest) => Promise<boolean>,
  ) {}

  getToolDefinitions() {
    return [
      {
        type: 'function' as const,
        function: {
          name: 'schedule_reminder',
          description: 'Schedule one-time or repeat reminder.',
          parameters: {
            type: 'object',
            properties: {
              task_name: { type: 'string' },
              message: { type: 'string' },
              mode: { type: 'string', enum: ['once', 'repeat'] },
              delay_minutes: { type: 'number' },
              interval_minutes: { type: 'number' },
            },
            required: ['mode'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'list_reminders',
          description: 'List existing reminders.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'cancel_reminder',
          description: 'Cancel a reminder by id.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'find_file',
          description: 'Search files by name keyword.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              limit: { type: 'number' },
              scope: { type: 'string', enum: ['normal', 'full'] },
            },
            required: ['query'],
          },
        },
      },
    ];
  }

  async executeTool(name: string, rawArgs: string, context: ToolContext): Promise<ToolResult> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
    } catch {
      args = {};
    }

    switch (name) {
      case 'schedule_reminder':
        return this.scheduleReminder(args);
      case 'list_reminders':
        return this.listReminders();
      case 'cancel_reminder':
        return this.cancelReminder(args);
      case 'find_file':
        return this.findFile(args, context);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  }

  private async scheduleReminder(args: Record<string, unknown>): Promise<ToolResult> {
    const mode = args.mode === 'repeat' ? 'repeat' : 'once';
    const reminder = await this.reminderService.scheduleReminder({
      task_name: String(args.task_name ?? '喝水提醒'),
      message: String(args.message ?? '该喝水了'),
      mode,
      delay_minutes: Number(args.delay_minutes ?? 30),
      interval_minutes: mode === 'repeat' ? Number(args.interval_minutes ?? args.delay_minutes ?? 30) : undefined,
    });

    await this.store.appendAuditLog(randomUUID().replaceAll('-', ''), 'tool.schedule_reminder', reminder as unknown as Record<string, unknown>);
    return { ok: true, data: reminder as unknown as Record<string, unknown> };
  }

  private async listReminders(): Promise<ToolResult> {
    const reminders = this.reminderService.listReminders();
    return { ok: true, data: { reminders } };
  }

  private async cancelReminder(args: Record<string, unknown>): Promise<ToolResult> {
    const id = String(args.id ?? '');
    if (!id) {
      return { ok: false, error: 'id is required' };
    }

    const cancelled = await this.reminderService.cancelReminder(id);
    await this.store.appendAuditLog(randomUUID().replaceAll('-', ''), 'tool.cancel_reminder', { id, cancelled });
    return cancelled ? { ok: true, data: { id, cancelled: true } } : { ok: false, error: `Reminder not found: ${id}` };
  }

  private async findFile(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const query = String(args.query ?? '').trim().toLowerCase();
    if (!query) {
      return { ok: false, error: 'query is required' };
    }

    const limit = Math.max(1, Math.min(50, Number(args.limit ?? 10)));
    const scope = String(args.scope ?? 'normal');
    const settings = this.permissionService.getSettings();

    let roots = this.permissionService.getSearchRoots(settings);
    if (scope === 'full' && settings.mode !== 'full_access') {
      if (!settings.require_approval_on_policy_escape) {
        return { ok: false, error: 'full scope denied by policy' };
      }

      const ok = await this.requestApproval(context.sessionId, {
        command: 'find_file(scope=full)',
        reason: 'Search request exceeds configured filesystem policy.',
        riskLevel: 'medium',
        timeoutMs: 30_000,
      });
      if (!ok) {
        return { ok: false, error: 'approval denied for full search' };
      }

      roots = [process.env.SystemDrive ? `${process.env.SystemDrive}\\` : 'C:\\'];
    }

    const files = await this.searchFiles(roots, query, limit);
    await this.store.appendAuditLog(randomUUID().replaceAll('-', ''), 'tool.find_file', {
      query,
      limit,
      scope,
      roots,
      result_count: files.length,
    });

    return { ok: true, data: { files } };
  }

  private async searchFiles(roots: string[], query: string, limit: number): Promise<string[]> {
    const results: string[] = [];
    const queue = roots.map((r) => path.resolve(r));
    const visited = new Set<string>();
    const maxVisited = 15000;

    while (queue.length > 0 && results.length < limit && visited.size < maxVisited) {
      const current = queue.shift()!;
      const normalized = current.toLowerCase();
      if (visited.has(normalized)) {
        continue;
      }
      visited.add(normalized);

      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.name.toLowerCase().includes(query)) {
          results.push(fullPath);
          if (results.length >= limit) {
            break;
          }
        }

        if (entry.isDirectory()) {
          queue.push(fullPath);
        }
      }
    }

    return results;
  }
}
