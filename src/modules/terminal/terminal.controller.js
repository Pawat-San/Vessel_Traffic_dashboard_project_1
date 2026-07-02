const terminalService = require('./terminal.service');
const { success } = require('../../utils/response');

class TerminalController {
  async getAllTerminals(req, res, next) {
    try {
      const activeOnly = req.query.activeOnly === 'true';
      const terminals = await terminalService.getAllTerminals(activeOnly);
      res.status(200).json(success(terminals));
    } catch (error) {
      next(error);
    }
  }

  async getTerminalById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const terminal = await terminalService.getTerminalById(id);
      res.status(200).json(success(terminal));
    } catch (error) {
      next(error);
    }
  }

  async createTerminal(req, res, next) {
    try {
      const created = await terminalService.createTerminal(req.body);
      res.status(201).json(success(created));
    } catch (error) {
      next(error);
    }
  }

  async updateTerminal(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await terminalService.updateTerminal(id, req.body);
      res.status(200).json(success(updated));
    } catch (error) {
      next(error);
    }
  }

  async deleteTerminal(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      await terminalService.deleteTerminal(id);
      res.status(200).json(success({ message: 'Terminal deleted successfully' }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TerminalController();
