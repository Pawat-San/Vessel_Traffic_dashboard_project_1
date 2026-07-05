const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createUser } = require('../helpers/factory');
const usersService = require('../../src/modules/users/users.service');
const database = require('../../src/database/knex');
const { AuthorizationError, ConflictError, NotFoundError } = require('../../src/utils/errors');

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
        { username: 'newadmin', password: 'password1234', display_name: 'New Admin', role: 'admin' },
        '127.0.0.1'
      );

      expect(created).not.toHaveProperty('password_hash');
      expect(created).not.toHaveProperty('refresh_token_hash');
      expect(created.must_change_password).toBeTruthy();
    });

    it('rejects an admin trying to create a superadmin account', async () => {
      const admin = await createUser({ username: 'admin1', role: 'admin' });

      await expect(
        usersService.createUser(
          admin,
          { username: 'sneaky', password: 'password1234', display_name: 'Sneaky', role: 'superadmin' },
          '127.0.0.1'
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('allows a superadmin to create another superadmin', async () => {
      const superadmin = await createUser({ username: 'sa2', role: 'superadmin' });

      const created = await usersService.createUser(
        superadmin,
        { username: 'sa3', password: 'password1234', display_name: 'Second Superadmin', role: 'superadmin' },
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
          { username: 'taken', password: 'password1234', display_name: 'Dup', role: 'operator' },
          '127.0.0.1'
        )
      ).rejects.toThrow('Username');
    });

    it('writes an audit log entry on account creation', async () => {
      const superadmin = await createUser({ username: 'sa5', role: 'superadmin' });
      const created = await usersService.createUser(
        superadmin,
        { username: 'audited', password: 'password1234', display_name: 'Audited', role: 'operator' },
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
      const admin = await createUser({ username: 'admin4', role: 'admin' });

      await expect(
        usersService.updateUser(admin, admin.id, { role: 'operator' }, '127.0.0.1')
      ).rejects.toThrow(ConflictError);
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

      await usersService.resetPassword(superadmin, target.id, 'newpassword123', '127.0.0.1');

      const row = await database.db('users').where('id', target.id).first();
      expect(row.must_change_password).toBeTruthy();
      expect(row.refresh_token_hash).toBeNull();
    });

    it('rejects an admin resetting a superadmin password', async () => {
      const admin = await createUser({ username: 'admin6', role: 'admin' });
      const superadmin = await createUser({ username: 'sa12', role: 'superadmin' });

      await expect(
        usersService.resetPassword(admin, superadmin.id, 'newpassword123', '127.0.0.1')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('changeOwnPassword()', () => {
    it('requires current_password for a voluntary change', async () => {
      const user = await createUser({ username: 'voluntary1', password: 'oldpassword123' });

      await expect(
        usersService.changeOwnPassword(user, { new_password: 'newpassword123' }, '127.0.0.1')
      ).rejects.toThrow();
    });

    it('does not require current_password when must_change_password is set', async () => {
      const user = await createUser({ username: 'forced1', password: 'oldpassword123', must_change_password: true });

      await expect(
        usersService.changeOwnPassword(user, { new_password: 'newpassword123' }, '127.0.0.1')
      ).resolves.toBe(true);

      const row = await database.db('users').where('id', user.id).first();
      expect(row.must_change_password).toBeFalsy();
    });
  });

  describe('getUserById()', () => {
    it('throws NotFoundError for a missing user', async () => {
      await expect(usersService.getUserById(999999)).rejects.toThrow(NotFoundError);
    });
  });
});
