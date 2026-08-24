const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createUser } = require('../helpers/factory');
const usersService = require('../../src/modules/users/users.service');
const database = require('../../src/database/knex');
const usersRepository = require('../../src/modules/users/users.repository');
const { verifyPassword } = require('../../src/utils/password');
const { AuthorizationError, ConflictError, NotFoundError, PasswordRecentlyUsedError } = require('../../src/utils/errors');

describe('UsersService Unit Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    await database.db('audit_logs').del();
    await database.db('users').del();
  });

  describe('createUser()', () => {
    it('never returns password_hash or refresh_token_hash', async () => {
      const superadmin = await createUser({ username: 'sa1', role: 'superadmin' });

      const created = await usersService.createUser(
        superadmin,
        { username: 'newadmin', password: 'Password1234!', display_name: 'New Admin', role: 'admin' },
        '127.0.0.1'
      );

      expect(created).not.toHaveProperty('password_hash');
      expect(created).not.toHaveProperty('refresh_token_hash');
      expect(created.must_change_password).toBeTruthy();
    });

    it('rejects an admin trying to create any account', async () => {
      const admin = await createUser({ username: 'admin1', role: 'admin' });

      await expect(
        usersService.createUser(
          admin,
          { username: 'sneaky', password: 'Password1234!', display_name: 'Sneaky', role: 'operator' },
          '127.0.0.1'
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('allows a superadmin to create another superadmin', async () => {
      const superadmin = await createUser({ username: 'sa2', role: 'superadmin' });

      const created = await usersService.createUser(
        superadmin,
        { username: 'sa3', password: 'Password1234!', display_name: 'Second Superadmin', role: 'superadmin' },
        '127.0.0.1'
      );

      expect(created.role).toBe('superadmin');
    });

    it('rejects creating a duplicate username', async () => {
      const superadmin = await createUser({ username: 'sa4', role: 'superadmin' });
      await createUser({ username: 'taken', role: 'operator' });

      await expect(
        usersService.createUser(
          superadmin,
          { username: 'taken', password: 'Password1234!', display_name: 'Dup', role: 'operator' },
          '127.0.0.1'
        )
      ).rejects.toThrow('Username');
    });

    it('writes an audit log entry on account creation', async () => {
      const superadmin = await createUser({ username: 'sa5', role: 'superadmin' });
      const created = await usersService.createUser(
        superadmin,
        { username: 'audited', password: 'Password1234!', display_name: 'Audited', role: 'operator' },
        '10.0.0.5'
      );

      const audit = await database.db('audit_logs').where({ action: 'CREATE', entity_type: 'user', entity_id: created.id }).first();
      expect(audit).toBeDefined();
      expect(audit.user_id).toBe(superadmin.id);
    });
  });

  describe('updateUser() -- privilege escalation guards', () => {
    it('rejects an admin editing an existing superadmin account', async () => {
      const admin = await createUser({ username: 'admin2', role: 'admin' });
      const superadmin = await createUser({ username: 'sa6', role: 'superadmin' });

      await expect(
        usersService.updateUser(admin, superadmin.id, { display_name: 'Hacked' }, '127.0.0.1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects an admin promoting anyone to superadmin', async () => {
      const admin = await createUser({ username: 'admin3', role: 'admin' });
      const operator = await createUser({ username: 'op1', role: 'operator' });

      await expect(
        usersService.updateUser(admin, operator.id, { role: 'superadmin' }, '127.0.0.1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('allows a superadmin to demote another superadmin', async () => {
      const superadmin = await createUser({ username: 'sa7', role: 'superadmin' });
      await createUser({ username: 'sa8', role: 'superadmin' }); // keep >1 active superadmin
      const targetSuperadmin = await createUser({ username: 'sa9', role: 'superadmin' });

      const updated = await usersService.updateUser(superadmin, targetSuperadmin.id, { role: 'admin' }, '127.0.0.1');
      expect(updated.role).toBe('admin');
    });

    it('prevents an actor from changing their own role', async () => {
      const superadmin = await createUser({ username: 'admin4', role: 'superadmin' });
      await createUser({ username: 'admin4-backup', role: 'superadmin' });

      await expect(
        usersService.updateUser(superadmin, superadmin.id, { role: 'operator' }, '127.0.0.1')
      ).rejects.toThrow(ConflictError);
    });

    it('rejects an admin editing an ordinary account', async () => {
      const admin = await createUser({ username: 'admin-ordinary-denied', role: 'admin' });
      const operator = await createUser({ username: 'ordinary-denied', role: 'operator' });

      await expect(
        usersService.updateUser(admin, operator.id, { display_name: 'Denied' }, '127.0.0.1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('prevents the last remaining active superadmin from deactivating themselves', async () => {
      const onlySuperadmin = await createUser({ username: 'sa10', role: 'superadmin' });

      await expect(
        usersService.updateUser(onlySuperadmin, onlySuperadmin.id, { is_active: false }, '127.0.0.1')
      ).rejects.toThrow(ConflictError);
    });

    it('allows demoting a superadmin when another active superadmin remains', async () => {
      const superadminA = await createUser({ username: 'sa10b', role: 'superadmin' });
      const superadminB = await createUser({ username: 'sa10c', role: 'superadmin' });

      const updated = await usersService.updateUser(superadminA, superadminB.id, { role: 'admin' }, '127.0.0.1');
      expect(updated.role).toBe('admin');
    });
  });

  describe('resetPassword()', () => {
    it('forces must_change_password and clears refresh_token_hash', async () => {
      const superadmin = await createUser({ username: 'sa11', role: 'superadmin' });
      const target = await createUser({ username: 'target1', role: 'operator' });
      await database.db('users').where('id', target.id).update({ refresh_token_hash: 'some-hash' });

      await usersService.resetPassword(superadmin, target.id, 'Newpassword123!', '127.0.0.1');

      const row = await database.db('users').where('id', target.id).first();
      expect(row.must_change_password).toBeTruthy();
      expect(row.refresh_token_hash).toBeNull();
    });

    it('rejects an admin resetting any other account password', async () => {
      const admin = await createUser({ username: 'admin6', role: 'admin' });
      const operator = await createUser({ username: 'op-reset-target', role: 'operator' });

      await expect(
        usersService.resetPassword(admin, operator.id, 'Newpassword123!', '127.0.0.1')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('changeOwnPassword()', () => {
    it('requires current_password for a voluntary change', async () => {
      const user = await createUser({ username: 'voluntary1', password: 'oldpassword123' });

      await expect(
        usersService.changeOwnPassword(user, { new_password: 'Newpassword123!' }, '127.0.0.1')
      ).rejects.toThrow();
    });

    it('does not require current_password when must_change_password is set', async () => {
      const user = await createUser({ username: 'forced1', password: 'oldpassword123', must_change_password: true });

      await expect(
        usersService.changeOwnPassword(user, { new_password: 'Newpassword123!' }, '127.0.0.1')
      ).resolves.toBe(true);

      const row = await database.db('users').where('id', user.id).first();
      expect(row.must_change_password).toBeFalsy();
    });

    it('rejects a password found in the five most recent hashes', async () => {
      const user = await createUser({
        username: 'history1',
        password: 'Current1!',
        must_change_password: true,
      });

      await expect(
        usersService.changeOwnPassword(user, { new_password: 'Current1!' }, '127.0.0.1')
      ).rejects.toThrow(PasswordRecentlyUsedError);
    });

    it('retains only five hashes and permits a password older than that window', async () => {
      const superadmin = await createUser({ username: 'history-sa', role: 'superadmin' });
      const target = await createUser({ username: 'history-target', password: 'History0!' });

      for (const password of ['History1!', 'History2!', 'History3!', 'History4!', 'History5!']) {
        await usersService.resetPassword(superadmin, target.id, password, '127.0.0.1');
      }

      const historyBefore = await database.db('password_history').where('user_id', target.id);
      expect(historyBefore).toHaveLength(5);

      await expect(
        usersService.resetPassword(superadmin, target.id, 'History0!', '127.0.0.1')
      ).resolves.toBe(true);

      const historyAfter = await database.db('password_history').where('user_id', target.id);
      expect(historyAfter).toHaveLength(5);
    });

    it('rolls back password state when audit logging fails', async () => {
      const superadmin = await createUser({ username: 'rollback-sa', role: 'superadmin' });
      const target = await createUser({ username: 'rollback-target', password: 'Original1!' });
      jest.spyOn(usersRepository, 'createAuditLog').mockRejectedValueOnce(new Error('audit unavailable'));

      await expect(
        usersService.resetPassword(superadmin, target.id, 'Replacement1!', '127.0.0.1')
      ).rejects.toThrow('audit unavailable');

      const credentials = await usersRepository.findCredentialsById(target.id);
      expect(await verifyPassword('Original1!', credentials.password_hash)).toBe(true);
      const history = await database.db('password_history').where('user_id', target.id);
      expect(history).toHaveLength(1);
    });
  });

  describe('getUserById()', () => {
    it('throws NotFoundError for a missing user', async () => {
      await expect(usersService.getUserById(999999)).rejects.toThrow(NotFoundError);
    });
  });
});
