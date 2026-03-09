import express from 'express';
import { z } from 'zod';
import type { PermissionSettings } from '../types/domain.js';
import { SqliteStore } from '../storage/sqliteStore.js';
import { PermissionService } from '../services/permissionService.js';
import { WindowsDpapiSecretProvider } from '../services/windowsDpapiSecretProvider.js';
import { ReminderService } from '../services/reminderService.js';

const LlmProfileSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  base_url: z.string().min(1),
  model: z.string().min(1),
  auth_type: z.literal('api_key').default('api_key'),
  is_active: z.boolean().optional(),
});

const LlmSecretSchema = z.object({
  api_key: z.string().min(1),
});

const ActiveProfileSchema = z.object({
  id: z.string().min(1),
});

const PermissionSchema = z.object({
  mode: z.enum(['workspace_only', 'whitelist', 'full_access']),
  workspace_root: z.string().min(1),
  whitelist_paths: z.array(z.string()).default([]),
  require_approval_on_policy_escape: z.boolean().default(true),
});

const ClientSettingsSchema = z.object({
  updated_at: z.string().datetime().optional(),
  gateway_url: z.string().min(1),
  backend_http_url: z.string().min(1),
  session_id: z.string().min(1),
  topmost: z.boolean(),
  pet_click_through: z.boolean(),
  use_openclaw_adapter: z.boolean(),
  enable_function_menu: z.boolean(),
  active_profile_id: z.string().optional(),
  interaction: z.object({
    enabled: z.boolean(),
    proactive_interval_minutes: z.number().int().min(1).max(720),
    quiet_hours_start: z.number().int().min(0).max(23),
    quiet_hours_end: z.number().int().min(0).max(23),
    max_speech_chars: z.number().int().min(8).max(240),
  }),
});

export function createHttpApp(
  store: SqliteStore,
  permissionService: PermissionService,
  secretProvider: WindowsDpapiSecretProvider,
  reminderService: ReminderService,
) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/settings/llm/profiles', (_req, res) => {
    const profiles = store.listLlmProfiles().map((p) => ({ ...p, encrypted_key: undefined }));
    res.json({ profiles });
  });

  app.post('/api/settings/llm/profiles', async (req, res) => {
    const parsed = LlmProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_profile', detail: parsed.error.flatten() });
    }

    const now = new Date().toISOString();
    const profile = {
      id: parsed.data.id ?? crypto.randomUUID().replaceAll('-', ''),
      name: parsed.data.name,
      base_url: parsed.data.base_url,
      model: parsed.data.model,
      auth_type: parsed.data.auth_type,
      encrypted_key: undefined,
      is_active: parsed.data.is_active ?? false,
      created_at: now,
      updated_at: now,
    };
    await store.upsertLlmProfile(profile);
    if (profile.is_active) {
      await store.setActiveLlmProfile(profile.id);
    }
    return res.json({ profile: { ...profile, encrypted_key: undefined } });
  });

  app.put('/api/settings/llm/profiles/:id', async (req, res) => {
    const parsed = LlmProfileSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_profile', detail: parsed.error.flatten() });
    }

    const existing = store.listLlmProfiles().find((p) => p.id === req.params.id);
    const now = new Date().toISOString();
    const profile = {
      id: req.params.id,
      name: parsed.data.name,
      base_url: parsed.data.base_url,
      model: parsed.data.model,
      auth_type: parsed.data.auth_type,
      encrypted_key: existing?.encrypted_key,
      is_active: parsed.data.is_active ?? existing?.is_active ?? false,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await store.upsertLlmProfile(profile);
    if (profile.is_active) {
      await store.setActiveLlmProfile(profile.id);
    }
    return res.json({ profile: { ...profile, encrypted_key: undefined } });
  });

  app.post('/api/settings/llm/profiles/:id/secret', async (req, res) => {
    const parsed = LlmSecretSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_secret', detail: parsed.error.flatten() });
    }

    try {
      const encrypted = await secretProvider.encrypt(parsed.data.api_key);
      await store.updateLlmProfileSecret(req.params.id, encrypted);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: 'secret_store_failed', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/settings/llm/active-profile', async (req, res) => {
    const parsed = ActiveProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_active_profile', detail: parsed.error.flatten() });
    }

    await store.setActiveLlmProfile(parsed.data.id);
    return res.json({ ok: true });
  });

  app.get('/api/settings/permissions', (_req, res) => {
    const settings = permissionService.getSettings();
    res.json({ settings });
  });

  app.put('/api/settings/permissions', async (req, res) => {
    const parsed = PermissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_permissions', detail: parsed.error.flatten() });
    }

    const settings = await permissionService.updateSettings(parsed.data as PermissionSettings);
    return res.json({ settings });
  });

  app.get('/api/settings/client', (_req, res) => {
    const settings = store.getClientSettings();
    res.json({ settings });
  });

  app.put('/api/settings/client', async (req, res) => {
    const parsed = ClientSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_client_settings', detail: parsed.error.flatten() });
    }

    const settings = {
      ...parsed.data,
      updated_at: parsed.data.updated_at ?? new Date().toISOString(),
    };
    await store.upsertClientSettings(settings);
    return res.json({ settings });
  });

  app.get('/api/reminders', (_req, res) => {
    res.json({ reminders: reminderService.listReminders() });
  });

  app.post('/api/reminders/:id/cancel', async (req, res) => {
    const cancelled = await reminderService.cancelReminder(req.params.id);
    if (!cancelled) {
      return res.status(404).json({ error: 'reminder_not_found' });
    }
    return res.json({ ok: true });
  });

  return app;
}
