const connection = require('../../database/connection');

class VesselRepository {
  /**
   * Find vessels matching filters with pagination and sorting
   */
  findAndCount(filters, pagination, sorting) {
    const whereClauses = [];
    const params = [];

    // Apply filters
    if (filters.status) {
      whereClauses.push('v.status = ?');
      params.push(filters.status);
    }
    if (filters.terminal_id) {
      whereClauses.push('v.terminal_id = ?');
      params.push(filters.terminal_id);
    }
    if (filters.search) {
      whereClauses.push('(v.vessel_name LIKE ? OR v.voy LIKE ? OR v.next_port LIKE ?)');
      const wild = `%${filters.search}%`;
      params.push(wild, wild, wild);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Get total count
    const countSql = `SELECT COUNT(*) as total FROM vessels v ${whereSql}`;
    const totalCount = connection.db.prepare(countSql).get(...params).total;

    // 2. Get paginated data
    const allowedSortFields = ['vessel_name', 'eta', 'etb', 'etd', 'atd', 'status', 'terminal_code'];
    let sortBy = 'v.eta'; // default sorting
    let sortDir = 'ASC';

    if (sorting.sortBy && allowedSortFields.includes(sorting.sortBy)) {
      if (sorting.sortBy === 'terminal_code') {
        sortBy = 't.code';
      } else {
        sortBy = `v.${sorting.sortBy}`;
      }
    }
    if (sorting.sortDir && ['ASC', 'DESC'].includes(sorting.sortDir.toUpperCase())) {
      sortDir = sorting.sortDir.toUpperCase();
    }

    const querySql = `
      SELECT v.*, t.code as terminal_code, t.name as terminal_name, u.display_name as updated_by_name
      FROM vessels v
      LEFT JOIN terminals t ON v.terminal_id = t.id
      LEFT JOIN users u ON v.updated_by = u.id
      ${whereSql}
      ORDER BY ${sortBy} ${sortDir}
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, pagination.limit, pagination.offset];
    const data = connection.db.prepare(querySql).all(...dataParams);

    return { totalCount, data };
  }

  /**
   * Find a vessel by its ID
   */
  findById(id) {
    return connection.db.prepare(`
      SELECT v.*, t.code as terminal_code, t.name as terminal_name, u.display_name as updated_by_name
      FROM vessels v
      LEFT JOIN terminals t ON v.terminal_id = t.id
      LEFT JOIN users u ON v.updated_by = u.id
      WHERE v.id = ?
    `).get(id);
  }

  /**
   * Create a new vessel
   */
  create(data) {
    const stmt = connection.db.prepare(`
      INSERT INTO vessels (
        vessel_name, voy, type, terminal_id, activity, eta, etb, etd, atd, status, next_port, remark, updated_by
      )
      VALUES (
        @vessel_name, @voy, @type, @terminal_id, @activity, @eta, @etb, @etd, @atd, @status, @next_port, @remark, @updated_by
      )
    `);
    const info = stmt.run(data);
    return { id: info.lastInsertRowid, ...data };
  }

  /**
   * Update an existing vessel
   */
  update(id, data) {
    connection.db.prepare(`
      UPDATE vessels
      SET vessel_name = @vessel_name,
          voy = @voy,
          type = @type,
          terminal_id = @terminal_id,
          activity = @activity,
          eta = @eta,
          etb = @etb,
          etd = @etd,
          atd = @atd,
          status = @status,
          next_port = @next_port,
          remark = @remark,
          updated_by = @updated_by,
          date_modify = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ id, ...data });

    return this.findById(id);
  }

  /**
   * Delete a vessel
   */
  delete(id) {
    connection.db.prepare('DELETE FROM vessels WHERE id = ?').run(id);
    return true;
  }

  /**
   * Get status counts summary
   */
  getSummary() {
    const rows = connection.db.prepare('SELECT status, COUNT(*) as count FROM vessels GROUP BY status').all();
    const summary = { 'AT SEA': 0, ANCHOR: 0, BERTH: 0, DEPART: 0, total: 0 };
    
    let total = 0;
    for (const row of rows) {
      summary[row.status] = row.count;
      total += row.count;
    }
    summary.total = total;
    return summary;
  }

  /**
   * Find vessels with ATD older than threshold (for archive job)
   */
  findExpiredForArchive(atdThresholdIso) {
    return connection.db.prepare(`
      SELECT v.*, t.code as terminal_code, u.display_name as updated_by_name
      FROM vessels v
      LEFT JOIN terminals t ON v.terminal_id = t.id
      LEFT JOIN users u ON v.updated_by = u.id
      WHERE v.atd IS NOT NULL AND v.atd <= ?
    `).all(atdThresholdIso);
  }

  /**
   * Delete multiple vessels by IDs (run in transaction during archiving)
   */
  deleteMany(ids, dbConn = connection.db) {
    if (!ids || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    dbConn.prepare(`DELETE FROM vessels WHERE id IN (${placeholders})`).run(...ids);
  }

  /**
   * Write an audit log entry
   */
  createAuditLog(logEntry, dbConn = connection.db) {
    const stmt = dbConn.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, changes, user_id, ip_address)
      VALUES (@action, @entity_type, @entity_id, @changes, @user_id, @ip_address)
    `);
    
    // Ensure changes is stringified JSON
    const changesStr = typeof logEntry.changes === 'object' 
      ? JSON.stringify(logEntry.changes) 
      : logEntry.changes;

    stmt.run({
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
  getAuditLogs(limit = 100) {
    return connection.db.prepare(`
      SELECT a.*, u.username, u.display_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = new VesselRepository();
