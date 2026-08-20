const usersRepository = require('./users.repository');
const { canManageUser, canCreateOrResetUser } = require('./users.policy');
const { hashPassword, verifyPassword } = require('../../utils/password');
const { getPasswordPolicyErrors, isPasswordExpired } = require('../../utils/passwordPolicy');
const {
  NotFoundError,
  ConflictError,
  AuthorizationError,
  AuthenticationError,
  ValidationError,
  PasswordRecentlyUsedError,
} = require('../../utils/errors');
const config = require('../../config');
const database = require('../../database/knex');
const logger = require('../../utils/logger');

class UsersService {
  /**
   * Enforce the account-management authorization policy, throwing if denied.
   */
  assertCanManage(actorRole, targetCurrentRole, targetNewRole) {
    const decision = canManageUser(actorRole, targetCurrentRole, targetNewRole);
    if (!decision.allowed) {
      throw new AuthorizationError(decision.reason);
    }
  }

  assertCanCreateOrReset(actorRole) {
    const decision = canCreateOrResetUser(actorRole);
    if (!decision.allowed) {
      throw new AuthorizationError(decision.reason);
    }
  }

  assertPasswordMeetsPolicy(password, field = 'new_password') {
    const errors = getPasswordPolicyErrors(password);
    if (errors.length > 0) {
      throw new ValidationError('Password does not meet security requirements', errors.map((error) => ({
        field,
        code: error.code,
        message: error.message,
      })));
    }
  }

  async assertPasswordNotReused(userId, candidatePassword, conn) {
    const recent = await usersRepository.findRecentPasswordHashes(
      userId,
      config.password.historyLimit,
      conn
    );

    for (const entry of recent) {
      if (await verifyPassword(candidatePassword, entry.password_hash)) {
        throw new PasswordRecentlyUsedError();
      }
    }
  }

  async setUserPassword({ targetUserId, newPassword, mustChangePassword, actorUserId, auditAction, auditReason, clientIp }) {
    this.assertPasswordMeetsPolicy(newPassword);

    await database.db.transaction(async (trx) => {
      await this.assertPasswordNotReused(targetUserId, newPassword, trx);
      const passwordHash = await hashPassword(newPassword);

      await usersRepository.setPasswordSecurityState(targetUserId, {
        password_hash: passwordHash,
        password_changed_at: new Date().toISOString(),
        must_change_password: mustChangePassword,
      }, trx);

      await usersRepository.insertPasswordHistory(targetUserId, passwordHash, trx);
      await usersRepository.prunePasswordHistory(targetUserId, config.password.historyLimit, trx);
      await usersRepository.createAuditLog({
        action: auditAction,
        entity_type: 'user',
        entity_id: targetUserId,
        changes: { reason: auditReason },
        user_id: actorUserId,
        ip_address: clientIp,
      }, trx);
    });
  }

  /**
   * Guard against an actor removing their own management power or the last
   * remaining active superadmin -- not part of the core privilege-escalation
   * policy, but prevents an unrecoverable lockout.
   */
  async assertNotSelfLockout(actorUser, target, payload) {
    const isSelf = actorUser.id === target.id;
    const isDemotingOrDeactivatingSelf = isSelf && (
      (payload.role && payload.role !== target.role) ||
      payload.is_active === false
    );
    if (isDemotingOrDeactivatingSelf) {
      throw new ConflictError('You cannot change your own role or deactivate your own account');
    }

    const isRemovingSuperadminStatus = target.role === 'superadmin' && (
      (payload.role && payload.role !== 'superadmin') || payload.is_active === false
    );
    if (isRemovingSuperadminStatus) {
      const activeSuperadmins = await usersRepository.countActiveSuperadmins();
      if (activeSuperadmins <= 1) {
        throw new ConflictError('Cannot remove the last remaining active superadmin account');
      }
    }
  }

  async listUsers(filters, pagination) {
    return usersRepository.findAndCount(filters, pagination);
  }

  async getUserById(id) {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }
    return user;
  }

  async createUser(actorUser, data, clientIp) {
    this.assertCanCreateOrReset(actorUser.role);
    this.assertCanManage(actorUser.role, undefined, data.role);
    this.assertPasswordMeetsPolicy(data.password, 'password');

    const existing = await usersRepository.findByUsername(data.username);
    if (existing) {
      throw new ConflictError(`Username '${data.username}' is already taken`);
    }

    const passwordHash = await hashPassword(data.password);
    const created = await database.db.transaction(async (trx) => {
      const newUser = await usersRepository.create({
        username: data.username,
        password_hash: passwordHash,
        display_name: data.display_name,
        role: data.role,
        is_active: 1,
        must_change_password: true,
        password_changed_at: new Date().toISOString(),
      }, trx);

      await usersRepository.insertPasswordHistory(newUser.id, passwordHash, trx);
      await usersRepository.createAuditLog({
        action: 'CREATE',
        entity_type: 'user',
        entity_id: newUser.id,
        changes: { username: data.username, role: data.role },
        user_id: actorUser.id,
        ip_address: clientIp,
      }, trx);

      return newUser;
    });

    logger.info(`User account created: ${created.username}`, { userId: created.id, createdBy: actorUser.id });
    return created;
  }

  async updateUser(actorUser, targetId, data, clientIp) {
    const target = await this.getUserById(targetId);
    this.assertCanManage(actorUser.role, target.role, data.role);
    await this.assertNotSelfLockout(actorUser, target, data);

    const updated = await usersRepository.update(targetId, data);

    await usersRepository.createAuditLog({
      action: 'UPDATE',
      entity_type: 'user',
      entity_id: targetId,
      changes: data,
      user_id: actorUser.id,
      ip_address: clientIp,
    });

    logger.info(`User account updated: ${updated.username}`, { userId: targetId, updatedBy: actorUser.id });
    return updated;
  }

  async deactivateUser(actorUser, targetId, clientIp) {
    const target = await this.getUserById(targetId);
    this.assertCanManage(actorUser.role, target.role);
    await this.assertNotSelfLockout(actorUser, target, { is_active: false });

    await usersRepository.update(targetId, { is_active: 0 });

    await usersRepository.createAuditLog({
      action: 'DEACTIVATE',
      entity_type: 'user',
      entity_id: targetId,
      changes: { deactivated: true },
      user_id: actorUser.id,
      ip_address: clientIp,
    });

    logger.info(`User account deactivated: ${target.username}`, { userId: targetId, deactivatedBy: actorUser.id });
    return true;
  }

  async resetPassword(actorUser, targetId, newPassword, clientIp) {
    this.assertCanCreateOrReset(actorUser.role);
    const target = await this.getUserById(targetId);
    this.assertCanManage(actorUser.role, target.role);

    await this.setUserPassword({
      targetUserId: targetId,
      newPassword,
      mustChangePassword: true,
      actorUserId: actorUser.id,
      auditAction: 'PASSWORD_RESET',
      auditReason: 'superadmin_reset',
      clientIp,
    });

    logger.info(`Password reset for user: ${target.username}`, { userId: targetId, resetBy: actorUser.id });
    return true;
  }

  async changeOwnPassword(actorUser, { current_password, new_password }, clientIp) {
    const credentials = await usersRepository.findCredentialsById(actorUser.id);
    if (!credentials) {
      throw new NotFoundError('User not found');
    }

    const passwordExpired = isPasswordExpired(credentials.password_changed_at, config.password.maxAgeDays);
    const forcedChange = Boolean(credentials.must_change_password) || passwordExpired;

    if (!forcedChange) {
      if (!current_password) {
        throw new AuthenticationError('Current password is required');
      }
      const isMatch = await verifyPassword(current_password, credentials.password_hash);
      if (!isMatch) {
        throw new AuthenticationError('Current password is incorrect');
      }
    }

    await this.setUserPassword({
      targetUserId: actorUser.id,
      newPassword: new_password,
      mustChangePassword: false,
      actorUserId: actorUser.id,
      auditAction: passwordExpired ? 'PASSWORD_EXPIRED_CHANGE' : 'PASSWORD_SELF_CHANGE',
      auditReason: passwordExpired ? 'expired' : (credentials.must_change_password ? 'forced_change' : 'voluntary_change'),
      clientIp,
    });

    logger.info(`User changed their own password: ${actorUser.username}`, { userId: actorUser.id });
    return true;
  }
}

module.exports = new UsersService();
