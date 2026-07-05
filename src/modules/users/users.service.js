const usersRepository = require('./users.repository');
const { canManageUser } = require('./users.policy');
const { hashPassword, verifyPassword } = require('../../utils/password');
const { NotFoundError, ConflictError, AuthorizationError, AuthenticationError } = require('../../utils/errors');
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
    this.assertCanManage(actorUser.role, undefined, data.role);

    const existing = await usersRepository.findByUsername(data.username);
    if (existing) {
      throw new ConflictError(`Username '${data.username}' is already taken`);
    }

    const password_hash = await hashPassword(data.password);
    const created = await usersRepository.create({
      username: data.username,
      password_hash,
      display_name: data.display_name,
      role: data.role,
      is_active: 1,
      must_change_password: true,
    });

    await usersRepository.createAuditLog({
      action: 'CREATE',
      entity_type: 'user',
      entity_id: created.id,
      changes: { username: data.username, role: data.role },
      user_id: actorUser.id,
      ip_address: clientIp,
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
    const target = await this.getUserById(targetId);
    this.assertCanManage(actorUser.role, target.role);

    const password_hash = await hashPassword(newPassword);
    await usersRepository.setPasswordAndForceChange(targetId, password_hash);

    await usersRepository.createAuditLog({
      action: 'PASSWORD_RESET',
      entity_type: 'user',
      entity_id: targetId,
      changes: { reset_by: actorUser.id },
      user_id: actorUser.id,
      ip_address: clientIp,
    });

    logger.info(`Password reset for user: ${target.username}`, { userId: targetId, resetBy: actorUser.id });
    return true;
  }

  async changeOwnPassword(actorUser, { current_password, new_password }, clientIp) {
    const credentials = await usersRepository.findCredentialsById(actorUser.id);
    if (!credentials) {
      throw new NotFoundError('User not found');
    }

    if (!credentials.must_change_password) {
      if (!current_password) {
        throw new AuthenticationError('Current password is required');
      }
      const isMatch = await verifyPassword(current_password, credentials.password_hash);
      if (!isMatch) {
        throw new AuthenticationError('Current password is incorrect');
      }
    }

    const password_hash = await hashPassword(new_password);
    await usersRepository.setOwnPassword(actorUser.id, password_hash);

    await usersRepository.createAuditLog({
      action: 'PASSWORD_SELF_CHANGE',
      entity_type: 'user',
      entity_id: actorUser.id,
      changes: { self_change: true },
      user_id: actorUser.id,
      ip_address: clientIp,
    });

    logger.info(`User changed their own password: ${actorUser.username}`, { userId: actorUser.id });
    return true;
  }
}

module.exports = new UsersService();
