/**
 * F13: VOY was changed from "exactly 4 alphanumeric characters" to "exactly
 * 3 digits". Every existing row used a "V" + 3-digit convention (V064, V005,
 * ...), which no longer passes validation.
 *
 * That is not merely cosmetic: the edit form sends the whole vessel back on
 * save, so an unchanged legacy `voy` travels in the payload and gets
 * rejected -- an operator could not save ANY edit to an existing vessel
 * (even one that never touched the VOY field) until its VOY was fixed by
 * hand. This strips the prefix so those rows conform.
 *
 * Scope -- `vessels` only, deliberately:
 *   - `vessel_archive` is read-only (its routes expose GET and a bulk purge;
 *     the repository never updates a row), so archived values never reach
 *     the Zod schema and cannot block anything.
 *   - It also holds older legacy formats ('075L', '129L', '0150') with no
 *     unambiguous 3-digit equivalent -- '0150' could be '015' or '150'.
 *     Rewriting only the V-prefixed subset there would alter historical
 *     records without making the column consistent, so it is left intact.
 *
 * Written with a JS-side filter rather than a regex UPDATE because the test
 * suite runs these migrations against SQLite, which has no `~` operator.
 */

const V_PREFIXED = /^V[0-9]{3}$/;

exports.up = async function up(knex) {
  const rows = await knex('vessels').select('id', 'voy').whereNotNull('voy');
  const toFix = rows.filter((row) => V_PREFIXED.test(row.voy));

  await knex.transaction(async (trx) => {
    for (const row of toFix) {
      await trx('vessels').where('id', row.id).update({ voy: row.voy.slice(1) });
    }
  });
};

/**
 * Intentionally a no-op.
 *
 * Re-adding the prefix would have to target 3-digit values, but after this
 * migration a 3-digit VOY is indistinguishable from one an operator entered
 * legitimately under the new rule. Rewriting those to 'V064' would corrupt
 * good data and make the affected vessels unsavable again -- exactly the bug
 * this migration exists to fix. Restoring the old values is a restore-from-
 * backup operation, not a rollback.
 */
exports.down = async function down() {};
