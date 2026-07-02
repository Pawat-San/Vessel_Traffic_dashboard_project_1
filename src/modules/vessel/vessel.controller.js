const vesselService = require('./vessel.service');
const { success } = require('../../utils/response');
const { parsePagination, getPaginationMeta } = require('../../utils/pagination');

class VesselController {
  async getVessels(req, res, next) {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      
      const filters = {
        status: req.query.status,
        terminal_id: req.query.terminal_id ? parseInt(req.query.terminal_id, 10) : undefined,
        search: req.query.search,
      };

      const sorting = {
        sortBy: req.query.sortBy || 'eta',
        sortDir: req.query.sortDir || 'asc',
      };

      const { totalCount, data } = await vesselService.getVessels(filters, { limit, offset }, sorting);
      const meta = getPaginationMeta(totalCount, page, limit);

      res.status(200).json(success(data, meta));
    } catch (error) {
      next(error);
    }
  }

  async getVesselSummary(req, res, next) {
    try {
      const summary = await vesselService.getVesselSummary();
      res.status(200).json(success(summary));
    } catch (error) {
      next(error);
    }
  }

  async getVesselById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const vessel = await vesselService.getVesselById(id);
      res.status(200).json(success(vessel));
    } catch (error) {
      next(error);
    }
  }

  async createVessel(req, res, next) {
    try {
      const userId = req.user.id;
      const clientIp = req.ip;
      const created = await vesselService.createVessel(req.body, userId, clientIp);
      res.status(201).json(success(created));
    } catch (error) {
      next(error);
    }
  }

  async updateVessel(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const userId = req.user.id;
      const clientIp = req.ip;
      const updated = await vesselService.updateVessel(id, req.body, userId, clientIp);
      res.status(200).json(success(updated));
    } catch (error) {
      next(error);
    }
  }

  async deleteVessel(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const userId = req.user.id;
      const clientIp = req.ip;
      await vesselService.deleteVessel(id, userId, clientIp);
      res.status(200).json(success({ message: 'Vessel deleted successfully' }));
    } catch (error) {
      next(error);
    }
  }

  async triggerArchive(req, res, next) {
    try {
      const archivedCount = await vesselService.archiveExpiredVessels();
      res.status(200).json(success({ archivedCount, message: `Archiving job completed. ${archivedCount} vessel(s) archived.` }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VesselController();
