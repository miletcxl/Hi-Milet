import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import type { ChatMessageRow, ClientSettings, LlmProfile, PermissionSettings, ReminderItem, ReminderMode } from '../types/domain.js';

const DEFAULT_PERMISSION: PermissionSettings = {
  mode: 'workspace_only',
  workspace_root: process.cwd(),
  whitelist_paths: [],
  require_approval_on_policy_escape: true,
};

const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  updated_at: new Date(0).toISOString(),
  gateway_url: 'ws://127.0.0.1:18789',
  backend_http_url: 'http://127.0.0.1:18790',
  session_id: 'desktop-main',
  topmost: true,
  pet_click_through: false,
  use_openclaw_adapter: false,
  enable_function_menu: true,
  interaction: {
    enabled: true,
    proactive_interval_minutes: 20,
    quiet_hours_start: 23,
    quiet_hours_end: 8,
    max_speech_chars: 36,
  },
};

export class SqliteStore {
  private constructor(
    private readonly db: any,
    private readonly dbFilePath: string,
  ) {}

  static async create(baseDir: string): Promise<SqliteStore> {
    await mkdir(baseDir, { recursive: true });
    const dbFilePath = path.join(baseDir, 'himilet.sqlite');
    const SQL = await initSqlJs();

    let db: any;
    try {
      const bin = await readFile(dbFilePath);
      db = new SQL.Database(new Uint8Array(bin));
    } catch {
      db = new SQL.Database();
    }

    const store = new SqliteStore(db, dbFilePath);
    store.ensureSchema();
    await store.persist();
    return store;
  }

  private ensureSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        stream_id TEXT,
        seq INTEGER NOT NULL DEFAULT 0,
        is_final INTEGER NOT NULL DEFAULT 0,
        interrupted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS llm_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        auth_type TEXT NOT NULL,
        encrypted_key TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permission_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT NOT NULL,
        workspace_root TEXT NOT NULL,
        whitelist_json TEXT NOT NULL,
        require_approval INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        task_name TEXT NOT NULL,
        message TEXT NOT NULL,
        mode TEXT NOT NULL,
        fire_at TEXT NOT NULL,
        interval_minutes INTEGER,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS client_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private async persist(): Promise<void> {
    await writeFile(this.dbFilePath, Buffer.from(this.db.export()));
  }

  private pickFirstRow<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
    const result = this.db.exec(sql, params)[0];
    if (!result || result.values.length === 0) {
      return null;
    }

    const row: Record<string, unknown> = {};
    result.columns.forEach((c: string, i: number) => {
      row[c] = result.values[0]?.[i] ?? null;
    });
    return row as T;
  }

  private pickRows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const result = this.db.exec(sql, params)[0];
    if (!result) {
      return [];
    }

    return result.values.map((values: unknown[]) => {
      const row: Record<string, unknown> = {};
      result.columns.forEach((c: string, i: number) => {
        row[c] = values[i] ?? null;
      });
      return row as T;
    });
  }

  async upsertConversation(id: string, now: string): Promise<void> {
    this.db.run(
      `
      INSERT INTO conversations (id, created_at, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
    `,
      [id, now, now],
    );
    await this.persist();
  }

  async upsertMessage(input: ChatMessageRow): Promise<void> {
    this.db.run(
      `
      INSERT INTO messages (id, conversation_id, role, content, stream_id, seq, is_final, interrupted, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        stream_id = excluded.stream_id,
        seq = excluded.seq,
        is_final = excluded.is_final,
        interrupted = excluded.interrupted
    `,
      [
        input.id,
        input.conversation_id,
        input.role,
        input.content,
        input.stream_id ?? null,
        input.seq,
        input.is_final ? 1 : 0,
        input.interrupted ? 1 : 0,
        input.created_at,
      ],
    );
    await this.persist();
  }

  listConversationMessages(conversationId: string): ChatMessageRow[] {
    type Row = {
      id: string;
      conversation_id: string;
      role: ChatMessageRow['role'];
      content: string;
      stream_id: string | null;
      seq: number;
      is_final: number;
      interrupted: number;
      created_at: string;
    };
    return this.pickRows<Row>(
      `
      SELECT id, conversation_id, role, content, stream_id, seq, is_final, interrupted, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `,
      [conversationId],
    ).map((r) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      role: r.role,
      content: r.content,
      stream_id: r.stream_id ?? undefined,
      seq: Number(r.seq),
      is_final: Number(r.is_final) === 1,
      interrupted: Number(r.interrupted) === 1,
      created_at: r.created_at,
    }));
  }

  listLlmProfiles(): LlmProfile[] {
    type Row = {
      id: string;
      name: string;
      base_url: string;
      model: string;
      auth_type: string;
      encrypted_key: string | null;
      is_active: number;
      created_at: string;
      updated_at: string;
    };

    return this.pickRows<Row>(
      `
      SELECT id, name, base_url, model, auth_type, encrypted_key, is_active, created_at, updated_at
      FROM llm_profiles
      ORDER BY created_at ASC
    `,
    ).map((r) => ({
      id: r.id,
      name: r.name,
      base_url: r.base_url,
      model: r.model,
      auth_type: (r.auth_type as LlmProfile['auth_type']) ?? 'api_key',
      encrypted_key: r.encrypted_key ?? undefined,
      is_active: Number(r.is_active) === 1,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  async upsertLlmProfile(profile: Omit<LlmProfile, 'created_at' | 'updated_at'>): Promise<void> {
    const now = new Date().toISOString();
    this.db.run(
      `
      INSERT INTO llm_profiles (id, name, base_url, model, auth_type, encrypted_key, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        base_url = excluded.base_url,
        model = excluded.model,
        auth_type = excluded.auth_type,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at
    `,
      [
        profile.id,
        profile.name,
        profile.base_url,
        profile.model,
        profile.auth_type,
        profile.encrypted_key ?? null,
        profile.is_active ? 1 : 0,
        now,
        now,
      ],
    );
    await this.persist();
  }

  async updateLlmProfileSecret(id: string, encryptedKey: string): Promise<void> {
    this.db.run(
      `
      UPDATE llm_profiles
      SET encrypted_key = ?, updated_at = ?
      WHERE id = ?
    `,
      [encryptedKey, new Date().toISOString(), id],
    );
    await this.persist();
  }

  async setActiveLlmProfile(id: string): Promise<void> {
    this.db.run(`UPDATE llm_profiles SET is_active = 0`);
    this.db.run(`UPDATE llm_profiles SET is_active = 1, updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
    await this.persist();
  }

  getActiveLlmProfile(): LlmProfile | null {
    type Row = {
      id: string;
      name: string;
      base_url: string;
      model: string;
      auth_type: string;
      encrypted_key: string | null;
      is_active: number;
      created_at: string;
      updated_at: string;
    };

    const row = this.pickFirstRow<Row>(
      `
      SELECT id, name, base_url, model, auth_type, encrypted_key, is_active, created_at, updated_at
      FROM llm_profiles
      WHERE is_active = 1
      LIMIT 1
    `,
    );
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      model: row.model,
      auth_type: (row.auth_type as LlmProfile['auth_type']) ?? 'api_key',
      encrypted_key: row.encrypted_key ?? undefined,
      is_active: true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  getPermissionSettings(): PermissionSettings {
    type Row = {
      mode: PermissionSettings['mode'];
      workspace_root: string;
      whitelist_json: string;
      require_approval: number;
    };
    const row = this.pickFirstRow<Row>(
      `
      SELECT mode, workspace_root, whitelist_json, require_approval
      FROM permission_settings
      WHERE id = 1
    `,
    );

    if (!row) {
      return DEFAULT_PERMISSION;
    }

    let whitelist: string[] = [];
    try {
      whitelist = JSON.parse(row.whitelist_json) as string[];
    } catch {
      whitelist = [];
    }

    return {
      mode: row.mode,
      workspace_root: row.workspace_root,
      whitelist_paths: whitelist,
      require_approval_on_policy_escape: Number(row.require_approval) === 1,
    };
  }

  async upsertPermissionSettings(settings: PermissionSettings): Promise<void> {
    this.db.run(
      `
      INSERT INTO permission_settings (id, mode, workspace_root, whitelist_json, require_approval)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        mode = excluded.mode,
        workspace_root = excluded.workspace_root,
        whitelist_json = excluded.whitelist_json,
        require_approval = excluded.require_approval
    `,
      [
        settings.mode,
        settings.workspace_root,
        JSON.stringify(settings.whitelist_paths),
        settings.require_approval_on_policy_escape ? 1 : 0,
      ],
    );
    await this.persist();
  }

  getClientSettings(): ClientSettings {
    type Row = {
      settings_json: string;
      updated_at: string;
    };
    const row = this.pickFirstRow<Row>(
      `
      SELECT settings_json, updated_at
      FROM client_settings
      WHERE id = 1
      LIMIT 1
    `,
    );

    if (!row) {
      return DEFAULT_CLIENT_SETTINGS;
    }

    try {
      const payload = JSON.parse(row.settings_json) as Partial<ClientSettings>;
      return {
        ...DEFAULT_CLIENT_SETTINGS,
        ...payload,
        updated_at: row.updated_at ?? payload.updated_at ?? DEFAULT_CLIENT_SETTINGS.updated_at,
        interaction: {
          ...DEFAULT_CLIENT_SETTINGS.interaction,
          ...(payload.interaction ?? {}),
        },
      };
    } catch {
      return DEFAULT_CLIENT_SETTINGS;
    }
  }

  async upsertClientSettings(settings: ClientSettings): Promise<void> {
    const updatedAt = settings.updated_at || new Date().toISOString();
    const normalized: ClientSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      ...settings,
      updated_at: updatedAt,
      interaction: {
        ...DEFAULT_CLIENT_SETTINGS.interaction,
        ...(settings.interaction ?? {}),
      },
    };

    this.db.run(
      `
      INSERT INTO client_settings (id, settings_json, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `,
      [JSON.stringify(normalized), normalized.updated_at],
    );
    await this.persist();
  }

  listReminders(): ReminderItem[] {
    type Row = {
      id: string;
      task_name: string;
      message: string;
      mode: ReminderMode;
      fire_at: string;
      interval_minutes: number | null;
      status: ReminderItem['status'];
      created_at: string;
      updated_at: string;
    };
    return this.pickRows<Row>(
      `
      SELECT id, task_name, message, mode, fire_at, interval_minutes, status, created_at, updated_at
      FROM reminders
      ORDER BY fire_at ASC
    `,
    ).map((r) => ({
      id: r.id,
      task_name: r.task_name,
      message: r.message,
      mode: r.mode,
      fire_at: r.fire_at,
      interval_minutes: r.interval_minutes ?? undefined,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  async upsertReminder(reminder: ReminderItem): Promise<void> {
    this.db.run(
      `
      INSERT INTO reminders (id, task_name, message, mode, fire_at, interval_minutes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_name = excluded.task_name,
        message = excluded.message,
        mode = excluded.mode,
        fire_at = excluded.fire_at,
        interval_minutes = excluded.interval_minutes,
        status = excluded.status,
        updated_at = excluded.updated_at
    `,
      [
        reminder.id,
        reminder.task_name,
        reminder.message,
        reminder.mode,
        reminder.fire_at,
        reminder.interval_minutes ?? null,
        reminder.status,
        reminder.created_at,
        reminder.updated_at,
      ],
    );
    await this.persist();
  }

  async appendAuditLog(id: string, action: string, detail: Record<string, unknown>): Promise<void> {
    this.db.run(
      `
      INSERT INTO audit_logs (id, action, detail_json, created_at)
      VALUES (?, ?, ?, ?)
    `,
      [id, action, JSON.stringify(detail), new Date().toISOString()],
    );
    await this.persist();
  }
}
