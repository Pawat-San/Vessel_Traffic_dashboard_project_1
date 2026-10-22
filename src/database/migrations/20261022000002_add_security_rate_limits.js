exports.up = async function (knex) {
  await knex.schema.createTable('security_rate_limits', (table) => {
    table.string('key', 64).primary();
    table.integer('attempts').notNullable();
    table.bigInteger('expires_at').notNullable().index();
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTable('security_rate_limits');
};
