const { canManageUser } = require('../../src/modules/users/users.policy');

describe('users.policy canManageUser() -- privilege escalation matrix', () => {
  describe('actor = superadmin', () => {
    it.each([
      ['superadmin', undefined],
      ['superadmin', 'superadmin'],
      ['superadmin', 'admin'],
      ['admin', 'superadmin'],
      ['admin', 'admin'],
      ['operator', 'viewer'],
      [undefined, 'superadmin'],
      [undefined, 'admin'],
      [undefined, 'operator'],
      [undefined, 'viewer'],
    ])('target current=%s, new=%s -> allowed', (targetCurrentRole, targetNewRole) => {
      expect(canManageUser('superadmin', targetCurrentRole, targetNewRole).allowed).toBe(true);
    });
  });

  describe('actor = admin', () => {
    it.each([
      ['superadmin', undefined],
      ['superadmin', 'admin'],
      ['superadmin', 'superadmin'],
      ['admin', 'superadmin'],
      ['operator', 'superadmin'],
      [undefined, 'superadmin'],
    ])('target current=%s, new=%s -> DENIED', (targetCurrentRole, targetNewRole) => {
      const decision = canManageUser('admin', targetCurrentRole, targetNewRole);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBeTruthy();
    });

    it.each([
      ['admin', 'admin'],
      ['admin', 'operator'],
      ['operator', 'admin'],
      ['viewer', 'operator'],
      ['admin', undefined],
      [undefined, 'admin'],
      [undefined, 'operator'],
      [undefined, 'viewer'],
    ])('target current=%s, new=%s -> allowed', (targetCurrentRole, targetNewRole) => {
      expect(canManageUser('admin', targetCurrentRole, targetNewRole).allowed).toBe(true);
    });
  });

  describe('actor = operator | viewer (fail-closed even if called directly)', () => {
    it.each(['operator', 'viewer'])('actor role %s is always denied', (actorRole) => {
      expect(canManageUser(actorRole, 'operator', 'admin').allowed).toBe(false);
      expect(canManageUser(actorRole, undefined, 'viewer').allowed).toBe(false);
    });
  });
});
