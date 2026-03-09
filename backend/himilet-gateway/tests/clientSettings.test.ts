import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SqliteStore } from '../src/storage/sqliteStore.js';

describe('ClientSettings store', () => {
  it('persists and reloads client settings', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'himilet-gw-test-'));
    try {
      const store = await SqliteStore.create(tempDir);
      const initial = store.getClientSettings();
      expect(initial.gateway_url).toBe('ws://127.0.0.1:18789');

      const updated = {
        ...initial,
        updated_at: new Date().toISOString(),
        gateway_url: 'ws://127.0.0.1:19999',
        backend_http_url: 'http://127.0.0.1:19990',
        topmost: false,
        interaction: {
          ...initial.interaction,
          proactive_interval_minutes: 42,
        },
      };
      await store.upsertClientSettings(updated);

      const storeReloaded = await SqliteStore.create(tempDir);
      const loaded = storeReloaded.getClientSettings();
      expect(loaded.gateway_url).toBe('ws://127.0.0.1:19999');
      expect(loaded.backend_http_url).toBe('http://127.0.0.1:19990');
      expect(loaded.topmost).toBe(false);
      expect(loaded.interaction.proactive_interval_minutes).toBe(42);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
