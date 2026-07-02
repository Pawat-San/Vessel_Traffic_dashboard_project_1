const archiveService = require('./archive.service');
const { success } = require('../../utils/response');
const { parsePagination, getPaginationMeta } = require('../../utils/pagination');

class ArchiveController {
  async getArchivedVessels(req, res, next) {
    try {
      const { page, limit, offset } = parsePagination(req.query);

      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search,
      };

      const { totalCount, data } = await archiveService.getArchivedVessels(filters, { limit, offset });
      const meta = getPaginationMeta(totalCount, page, limit);

      res.status(200).json(success(data, meta));
    } catch (error) {
      next(error);
    }
  }

  async purgeArchive(req, res, next) {
    try {
      const days = req.query.days ? parseInt(req.query.days, 10) : 90;
      const count = await archiveService.purgeOldArchive(days);
      res.status(200).json(success({ purgedCount: count, message: `Successfully purged ${count} historical record(s) older than ${days} days.` }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ArchiveController();
