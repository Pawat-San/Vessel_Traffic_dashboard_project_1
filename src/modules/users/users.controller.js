const usersService = require('./users.service');
const { success } = require('../../utils/response');
const { parsePagination, getPaginationMeta } = require('../../utils/pagination');

class UsersController {
  async list(req, res, next) {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const filters = { role: req.query.role };

      const { totalCount, data } = await usersService.listUsers(filters, { limit, offset });
      const meta = getPaginationMeta(totalCount, page, limit);

      res.status(200).json(success(data, meta));
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const user = await usersService.getUserById(id);
      res.status(200).json(success(user));
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const created = await usersService.createUser(req.user, req.body, req.ip);
      res.status(201).json(success(created));
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await usersService.updateUser(req.user, id, req.body, req.ip);
      res.status(200).json(success(updated));
    } catch (error) {
      next(error);
    }
  }

  async deactivate(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      await usersService.deactivateUser(req.user, id, req.ip);
      res.status(200).json(success({ message: 'User account deactivated successfully' }));
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      await usersService.resetPassword(req.user, id, req.body.new_password, req.ip);
      res.status(200).json(success({ message: 'Password reset. User must change password on next login.' }));
    } catch (error) {
      next(error);
    }
  }

  async changeOwnPassword(req, res, next) {
    try {
      await usersService.changeOwnPassword(req.user, req.body, req.ip);
      res.status(200).json(success({ message: 'Password changed successfully' }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UsersController();
