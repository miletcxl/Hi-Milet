import { describe, expect, it } from 'vitest';
import type { PermissionSettings } from '../src/types/domain.js';
import { PermissionService } from '../src/services/permissionService.js';

const fakeStore = {
  getPermissionSettings: () =>
    ({
      mode: 'workspace_only',
      workspace_root: 'C:\\workspace',
      whitelist_paths: [],
      require_approval_on_policy_escape: true,
    }) as PermissionSettings,
  upsertPermissionSettings: async () => undefined,
};

describe('PermissionService', () => {
  const service = new PermissionService(fakeStore as never);

  it('allows workspace path in workspace_only mode', () => {
    const settings: PermissionSettings = {
      mode: 'workspace_only',
      workspace_root: 'C:\\workspace',
      whitelist_paths: [],
      require_approval_on_policy_escape: true,
    };

    expect(service.isPathAllowed('C:\\workspace\\docs\\a.md', settings)).toBe(true);
    expect(service.isPathAllowed('C:\\other\\a.md', settings)).toBe(false);
  });
});
