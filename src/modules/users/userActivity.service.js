const database = require('../../database/knex');
const repository = require('./userActivity.repository');
const { AuthorizationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { getActionLabel } = require('../../utils/activityCatalog');

const ROLES = ['superadmin', 'admin', 'operator', 'viewer'];
const ACTIVE_NOW_MS = 15 * 60 * 1000;
const ACTIVE_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function emptyMetrics() {
  return {
    totalAccounts: 0,
    enabledAccounts: 0,
    everLoggedIn: 0,
    activeNow: 0,
    actuallyUsedIn30Days: 0,
    inactiveOver30Days: 0,
    neverLoggedIn: 0,
    deactivated: 0,
  };
}

function addUserToMetrics(metrics, user, nowMs) {
  const enabled = Boolean(user.is_active);
  const lastLoginMs = user.last_login_at ? new Date(user.last_login_at).getTime() : NaN;
  const lastActivityMs = user.last_activity_at ? new Date(user.last_activity_at).getTime() : NaN;
  const activityAge = Number.isFinite(lastActivityMs) ? nowMs - lastActivityMs : Infinity;

  metrics.totalAccounts += 1;
  if (enabled) metrics.enabledAccounts += 1;
  else metrics.deactivated += 1;
  if (Number.isFinite(lastLoginMs)) metrics.everLoggedIn += 1;
  else metrics.neverLoggedIn += 1;

  if (enabled && activityAge >= 0 && activityAge < ACTIVE_NOW_MS) metrics.activeNow += 1;
  if (enabled && activityAge >= 0 && activityAge < ACTIVE_30_DAYS_MS) {
    metrics.actuallyUsedIn30Days += 1;
  }
  if (enabled && Number.isFinite(lastLoginMs) && activityAge >= ACTIVE_30_DAYS_MS) {
    metrics.inactiveOver30Days += 1;
  }
}

class UserActivityService {
  assertSuperadmin(actor) {
    if (!actor || actor.role !== 'superadmin') {
      throw new AuthorizationError('Only superadmins can view user activity');
    }
  }

  async recordSuccessfulLogin(user, metadata, tokenHash) {
    return database.db.transaction((trx) => repository.recordLogin(user, metadata, tokenHash, trx));
  }

  async recordRequestActivity(user, metadata) {
    try {
      await repository.recordActivity(user, metadata);
    } catch (error) {
      logger.error('Failed to record user activity', {
        error: error.message,
        userId: user && user.id,
        action: metadata && metadata.action,
      });
    }
  }

  async getSummary(actor, now = new Date()) {
    this.assertSuperadmin(actor);
    const users = await repository.findUsersForSummary();
    const summary = { ...emptyMetrics(), byRole: {} };
    for (const role of ROLES) summary.byRole[role] = emptyMetrics();

    for (const user of users) {
      addUserToMetrics(summary, user, now.getTime());
      if (!summary.byRole[user.role]) summary.byRole[user.role] = emptyMetrics();
      addUserToMetrics(summary.byRole[user.role], user, now.getTime());
    }
    summary.generatedAt = now.toISOString();
    return summary;
  }

  async listEvents(actor, filters, pagination) {
    this.assertSuperadmin(actor);
    const result = await repository.findEventsAndCount(filters, pagination);
    return {
      ...result,
      data: result.data.map((event) => {
        const targetUsername = event.target_username_snapshot || event.target_username_current || null;
        const targetDisplayName = event.target_display_name_snapshot || event.target_display_name_current || null;
        return {
          ...event,
          action_label: getActionLabel(event.action),
          actor: {
            id: event.user_id,
            username: event.username,
            display_name: event.display_name,
          },
          target: event.target_user_id || targetUsername ? {
            id: event.target_user_id,
            username: targetUsername,
            display_name: targetDisplayName,
          } : null,
        };
      }),
    };
  }

  async purgeExpiredEvents(retentionDays) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    return repository.purgeOlderThan(cutoff);
  }
}

module.exports = new UserActivityService();
