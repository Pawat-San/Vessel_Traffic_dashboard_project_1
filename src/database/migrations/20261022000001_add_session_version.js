exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.integer('session_version').notNullable().defaultTo(1);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (table) => table.dropColumn('session_version'));
};
