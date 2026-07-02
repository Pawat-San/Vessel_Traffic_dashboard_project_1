const { db } = require('../../database/connection');

class ArchiveRepository {
  /**
   * Find archived vessels matching filters with pagination
   */
  findAndCount(filters, pagination) {
    const whereClauses = [];
    const params = [];

    // Filter by date range (archived_at or atd)
    if (filters.startDate) {
      whereClauses.push('archived_at >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      // Append time to capture the entire day if only YYYY-MM-DD is passed
      let end = filters.endDate;
      if (end.length === 10) {
        end += 'T23:59:59.999Z';
      }
      whereClauses.push('archived_at <= ?');
      params.push(end);
    }
    if (filters.search) {
      whereClauses.push('(vessel_name LIKE ? OR voy LIKE ? OR terminal_code LIKE ?)');
      const wild = `%${filters.search}%`;
      params.push(wild, wild, wild);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Get total count
    const countSql = `SELECT COUNT(*) as total FROM vessel_archive ${whereSql}`;
    const totalCount = db.prepare(countSql).get(...params).total;

    // 2. Get paginated data
    const querySql = `
      SELECT *
      FROM vessel_archive
      ${whereSql}
      ORDER BY archived_at DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, pagination.limit, pagination.offset];
    const data = db.prepare(querySql).all(...dataParams);

    return { totalCount, data };
  }

  /**
   * Purge archived entries older than a set number of days (e.g. 90 days)
   */
  purge(daysThreshold = 90) {
    const thresholdDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);
    const thresholdIso = thresholdDate.toISOString();

    const info = db.prepare('DELETE FROM vessel_archive WHERE archived_at <= ?').run(thresholdIso);
    return info.changes;
  }
}

module.exports = new ArchiveRepository();
