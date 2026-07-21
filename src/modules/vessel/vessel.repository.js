const database = require('../../database/knex');

// NOTE: always access `database.db` at call time (never destructure/cache it at
// module load), so tests that repoint config.db.path to ':memory:' before
// calling their repository/service code still connect to the right database.

class VesselRepository {
  /**
   * Build the base filtered query (shared by count + data queries)
   */
  baseQuery(filters, conn = database.db) {
    let query = conn('vessels as v');

    if (filters.status) {
      query = query.where('v.status', filters.status);
    }
    if (filters.terminal_id) {
      query = query.where('v.terminal_id', filters.terminal_id);
    }
    if (filters.search) {
      const wild = `%${filters.search}%`;
      query = query.where((builder) => {
        builder
          .where('v.vessel_name', 'like', wild)
          .orWhere('v.voy', 'like', wild)
          .orWhere('v.next_port', 'like', wild);
      });
    }

    return query;
  }

  /**
   * Find vessels matching filters with pagination and sorting
   */
  async findAndCount(filters, pagination, sorting) {
    const allowedSortFields = {
      vessel_name: 'v.vessel_name',
      eta: 'v.eta',
      etb: 'v.etb',
      etd: 'v.etd',
      atd: 'v.atd',
      status: 'v.status',
      terminal_code: 't.code',
    };

    const sortBy = allowedSortFields[sorting.sortBy] || 'v.etd';
    const sortDir = sorting.sortDir && ['asc', 'desc'].includes(sorting.sortDir.toLowerCase())
      ? sorting.sortDir.toLowerCase()
      : 'asc';

    const { total } = await this.baseQuery(filters).count({ total: '*' }).first();

    const data = await this.baseQuery(filters)
      .leftJoin('terminals as t', 'v.terminal_id', 't.id')
      .leftJoin('users as u', 'v.updated_by', 'u.id')
      .select('v.*', 't.code as terminal_code', 't.name as terminal_name', 'u.display_name as updated_by_name')
      .orderBy(sortBy, sortDir)
      .limit(pagination.limit)
      .offset(pagination.offset);

    return { totalCount: Number(total), data };
  }

  /**
   * Find a vessel by its ID
   */
  async findById(id, conn = database.db) {
    return conn('vessels as v')
      .leftJoin('terminals as t', 'v.terminal_id', 't.id')
      .leftJoin('users as u', 'v.updated_by', 'u.id')
      .select('v.*', 't.code as terminal_code', 't.name as terminal_name', 'u.display_name as updated_by_name')
      .where('v.id', id)
      .first();
  }

  /**
   * Create a new vessel
   */
  async create(data, conn = database.db) {
    const [row] = await conn('vessels').insert(data).returning('*');
    return row;
  }

  /**
   * Update an existing vessel
   */
  async update(id, data, conn = database.db) {
    await conn('vessels')
      .where('id', id)
      .update({ ...data, date_modify: conn.fn.now() });

    return this.findById(id, conn);
  }

  /**
   * Delete a vessel
   */
  async delete(id, conn = database.db) {
    await conn('vessels').where('id', id).del();
    return true;
  }

  /**
   * Get status counts summary
   */
  async getSummary() {
    const rows = await database.db('vessels').select('status').count({ count: '*' }).groupBy('status');
    const summary = { 'AT SEA': 0, ANCHOR: 0, BERTH: 0, DEPART: 0, total: 0 };

    let total = 0;
    for (const row of rows) {
      const count = Number(row.count);
      summary[row.status] = count;
      total += count;
    }
    summary.total = total;
    return summary;
  }

  /**
   * Find vessels with ATD older than threshold (for archive job)
   */
  async findExpiredForArchive(atdThresholdIso, conn = database.db) {
    return conn('vessels as v')
      .leftJoin('terminals as t', 'v.terminal_id', 't.id')
      .leftJoin('users as u', 'v.updated_by', 'u.id')
      .select('v.*', 't.code as terminal_code', 'u.display_name as updated_by_name')
      .whereNotNull('v.atd')
      .andWhere('v.atd', '<=', atdThresholdIso);
  }

  /**
   * Delete multiple vessels by IDs (run in transaction during archiving)
   */
  async deleteMany(ids, conn = database.db) {
    if (!ids || ids.length === 0) return;
    await conn('vessels').whereIn('id', ids).del();
  }

  /**
   * Write an audit log entry
   */
  async createAuditLog(logEntry, conn = database.db) {
    const changesStr = typeof logEntry.changes === 'object'
      ? JSON.stringify(logEntry.changes)
      : logEntry.changes;

    await conn('audit_logs').insert({
      action: logEntry.action,
      entity_type: logEntry.entity_type,
      entity_id: logEntry.entity_id,
      changes: changesStr || null,
      user_id: logEntry.user_id,
      ip_address: logEntry.ip_address || null,
    });
  }

  /**
   * Get audit logs for Admin Panel (Optional but useful for verification)
   */
  async getAuditLogs(limit = 100) {
    return database.db('audit_logs as a')
      .leftJoin('users as u', 'a.user_id', 'u.id')
      .select('a.*', 'u.username', 'u.display_name')
      .orderBy('a.created_at', 'desc')
      .limit(limit);
  }
}

module.exports = new VesselRepository();
