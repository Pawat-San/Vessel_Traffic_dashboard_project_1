const database = require('../../database/knex');

class ArchiveRepository {
  /**
   * Find archived vessels matching filters with pagination
   */
  async findAndCount(filters, pagination) {
    const buildQuery = () => {
      let query = database.db('vessel_archive');

      if (filters.startDate) {
        query = query.where('archived_at', '>=', filters.startDate);
      }
      if (filters.endDate) {
        let end = filters.endDate;
        if (end.length === 10) {
          end += 'T23:59:59.999Z';
        }
        query = query.where('archived_at', '<=', end);
      }
      if (filters.search) {
        const wild = `%${filters.search}%`;
        query = query.where((builder) => {
          builder
            .where('vessel_name', 'like', wild)
            .orWhere('voy', 'like', wild)
            .orWhere('terminal_code', 'like', wild);
        });
      }

      return query;
    };

    const { total } = await buildQuery().count({ total: '*' }).first();

    const data = await buildQuery()
      .select('*')
      .orderBy('archived_at', 'desc')
      .limit(pagination.limit)
      .offset(pagination.offset);

    return { totalCount: Number(total), data };
  }

  /**
   * Purge archived entries older than a set number of days (e.g. 90 days)
   */
  async purge(daysThreshold = 90) {
    const thresholdDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);
    const thresholdIso = thresholdDate.toISOString();

    return database.db('vessel_archive').where('archived_at', '<=', thresholdIso).del();
  }
}

module.exports = new ArchiveRepository();
