const usersService = require('./users.service');
const { success } = require('../../utils/response');
const { parsePagination, getPaginationMeta } = require('../../utils/pagination');

class UsersController {
  async list(req, res, next) {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const filters = {
        role: req.query.role,
        activityStatus: req.query.activityStatus,
        search: req.query.search,
      };

      const { totalCount, data } = await usersService.listUsers(req.user, filters, { limit, offset });
      const meta = getPaginationMeta(totalCount, page, limit);

      res.locals.activity = { action: 'ACCOUNT_LIST_VIEWED' };
      res.status(200).json(success(data, meta));
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const user = await usersService.getManagedUserById(req.user, id);
      res.locals.activity = {
        action: 'ACCOUNT_DETAILS_VIEWED',
        targetUserId: user.id,
        targetUsername: user.username,
        targetDisplayName: user.display_name,
      };
      res.status(200).json(success(user));
    } catch (error) {
      next(error);
    }
  }

  async activitySummary(req, res, next) {
    try {
      const summary = await usersService.getActivitySummary(req.user);
      res.locals.activity = { action: 'ACTIVITY_REPORT_VIEWED' };
      res.status(200).json(success(summary));
    } catch (error) {
      next(error);
    }
  }

  async activityEvents(req, res, next) {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const filters = {
        userId: req.params.id ? parseInt(req.params.id, 10) : req.query.userId,
        targetUserId: req.query.targetUserId,
        role: req.query.role,
        action: req.query.action,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };
      const { totalCount, data } = await usersService.listActivityEvents(
        req.user,
        filters,
        { limit, offset }
      );
      res.locals.activity = { action: 'ACTIVITY_REPORT_VIEWED' };
      res.status(200).json(success(data, getPaginationMeta(totalCount, page, limit)));
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const created = await usersService.createUser(req.user, req.body, req.ip);
      res.locals.activity = {
        action: 'ACCOUNT_CREATED',
        targetUserId: created.id,
        targetUsername: created.username,
        targetDisplayName: created.display_name,
      };
      res.status(201).json(success(created));
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await usersService.updateUser(req.user, id, req.body, req.ip);
      res.locals.activity = {
        action: 'ACCOUNT_UPDATED',
        targetUserId: updated.id,
        targetUsername: updated.username,
        targetDisplayName: updated.display_name,
      };
      res.status(200).json(success(updated));
    } catch (error) {
      next(error);
    }
  }

  async deactivate(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const target = await usersService.getManagedUserById(req.user, id);
      await usersService.deactivateUser(req.user, id, req.ip);
      res.locals.activity = {
        action: 'ACCOUNT_DEACTIVATED',
        targetUserId: target.id,
        targetUsername: target.username,
        targetDisplayName: target.display_name,
      };
      res.status(200).json(success({ message: 'User account deactivated successfully' }));
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const target = await usersService.getManagedUserById(req.user, id);
      await usersService.resetPassword(req.user, id, req.body.new_password, req.ip);
      res.locals.activity = {
        action: 'ACCOUNT_PASSWORD_RESET',
        targetUserId: target.id,
        targetUsername: target.username,
        targetDisplayName: target.display_name,
      };
      res.status(200).json(success({ message: 'Password reset. User must change password on next login.' }));
    } catch (error) {
      next(error);
    }
  }

  async changeOwnPassword(req, res, next) {
    try {
      await usersService.changeOwnPassword(req.user, req.body, req.ip);
      res.locals.activity = {
        action: 'PASSWORD_SELF_CHANGED',
        targetUserId: req.user.id,
        targetUsername: req.user.username,
        targetDisplayName: req.user.displayName,
      };
      res.status(200).json(success({ message: 'Password changed successfully' }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UsersController();
