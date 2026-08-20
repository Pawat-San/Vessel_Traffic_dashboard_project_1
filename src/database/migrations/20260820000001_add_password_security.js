/**
 * Adds password lifetime tracking and a bounded password-history store.
 * Existing users receive a fresh 90-day window at deployment time and their
 * current hash becomes the first history entry.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('password_changed_at').nullable();
  });

  await knex.schema.createTable('password_history', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('password_hash').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index('user_id', 'idx_password_history_user_id');
    table.index(['user_id', 'created_at'], 'idx_password_history_user_created');
  });

  const migrationTime = new Date().toISOString();
  const users = await knex('users').select('id', 'password_hash');

  await knex.transaction(async (trx) => {
    if (users.length > 0) {
      await trx('users').whereNull('password_changed_at').update({ password_changed_at: migrationTime });
      await trx('password_history').insert(users.map((user) => ({
        user_id: user.id,
        password_hash: user.password_hash,
        created_at: migrationTime,
      })));
    }
  });

  if (knex.client.config.client === 'pg') {
    await knex.raw('ALTER TABLE public."password_history" ENABLE ROW LEVEL SECURITY');
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('password_history');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('password_changed_at');
  });
};
