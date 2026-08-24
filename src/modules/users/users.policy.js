/**
 * Pure authorization-decision function for account management.
 *
 * Kept separate from the generic role-list `authorize` middleware because it
 * This service-level guard deliberately mirrors the route-level Superadmin
 * restriction so internal callers cannot bypass the HTTP authorization.
 *
 * @param {'admin'|'superadmin'} actorRole
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canManageUser(actorRole) {
  if (actorRole === 'superadmin') {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only superadmins can manage accounts' };
}

function canCreateOrResetUser(actorRole) {
  if (actorRole !== 'superadmin') {
    return { allowed: false, reason: 'Only superadmins can create accounts or reset passwords' };
  }
  return { allowed: true };
}

module.exports = { canManageUser, canCreateOrResetUser };
