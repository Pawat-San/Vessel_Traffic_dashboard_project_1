/**
 * Adds target-account metadata so an activity event can distinguish the
 * actor from the account affected by an Account Management operation.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('user_activity_events', (table) => {
    table.integer('target_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('target_username_snapshot', 255).nullable();
    table.string('target_display_name_snapshot', 255).nullable();
    table.index(['target_user_id', 'occurred_at'], 'idx_activity_target_occurred');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('user_activity_events', (table) => {
    table.dropIndex(['target_user_id', 'occurred_at'], 'idx_activity_target_occurred');
    table.dropColumn('target_display_name_snapshot');
    table.dropColumn('target_username_snapshot');
    table.dropColumn('target_user_id');
  });
};
