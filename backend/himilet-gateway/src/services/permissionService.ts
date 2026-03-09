import path from 'node:path';
import type { PermissionSettings } from '../types/domain.js';
import { SqliteStore } from '../storage/sqliteStore.js';

function normalizePath(p: string): string {
  return path.resolve(p).toLowerCase();
}

export class PermissionService {
  constructor(private readonly store: SqliteStore) {}

  getSettings(): PermissionSettings {
    return this.store.getPermissionSettings();
  }

  async updateSettings(next: PermissionSettings): Promise<PermissionSettings> {
    const sanitized: PermissionSettings = {
      mode: next.mode,
      workspace_root: path.resolve(next.workspace_root),
      whitelist_paths: next.whitelist_paths.map((p) => path.resolve(p)),
      require_approval_on_policy_escape: next.require_approval_on_policy_escape,
    };
    await this.store.upsertPermissionSettings(sanitized);
    return sanitized;
  }

  isPathAllowed(targetPath: string, settings: PermissionSettings): boolean {
    const normalizedTarget = normalizePath(targetPath);
    const workspaceRoot = normalizePath(settings.workspace_root);

    if (settings.mode === 'full_access') {
      return true;
    }

    if (settings.mode === 'workspace_only') {
      return normalizedTarget.startsWith(workspaceRoot);
    }

    const allWhitelists = settings.whitelist_paths.map(normalizePath);
    return allWhitelists.some((root) => normalizedTarget.startsWith(root));
  }

  getSearchRoots(settings: PermissionSettings): string[] {
    if (settings.mode === 'full_access') {
      return [process.env.SystemDrive ? `${process.env.SystemDrive}\\` : 'C:\\'];
    }

    if (settings.mode === 'workspace_only') {
      return [path.resolve(settings.workspace_root)];
    }

    if (settings.whitelist_paths.length > 0) {
      return settings.whitelist_paths.map((p) => path.resolve(p));
    }

    return [path.resolve(settings.workspace_root)];
  }
}
