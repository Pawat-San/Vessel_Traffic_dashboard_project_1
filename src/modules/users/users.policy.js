/**
 * Pure authorization-decision function for account management.
 *
 * Kept separate from the generic role-list `authorize` middleware because it
 * must reason about BOTH the actor's role and the target account's current
 * and/or requested role -- a route-level `authorize(['admin'])` check has no
 * notion of "the resource being acted on has a role too."
 *
 * @param {'admin'|'superadmin'} actorRole
 * @param {string} [targetCurrentRole] - role of the account being acted on; omit for CREATE
 * @param {string} [targetNewRole] - role being assigned; omit for non-role-changing actions
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canManageUser(actorRole, targetCurrentRole, targetNewRole) {
  if (actorRole !== 'admin' && actorRole !== 'superadmin') {
    return { allowed: false, reason: 'Actor is not a management role' };
  }

  // Superadmin: unrestricted, including managing other superadmins.
  if (actorRole === 'superadmin') {
    return { allowed: true };
  }

  // From here, actorRole === 'admin'.

  // Admins cannot act on an existing superadmin account at all.
  if (targetCurrentRole === 'superadmin') {
    return { allowed: false, reason: 'Admins cannot manage superadmin accounts' };
  }

  // Admins cannot grant the superadmin role to anyone (including themselves),
  // whether creating a new account or changing an existing one's role.
  if (targetNewRole === 'superadmin') {
    return { allowed: false, reason: 'Admins cannot grant the superadmin role' };
  }

  return { allowed: true };
}

module.exports = { canManageUser };
