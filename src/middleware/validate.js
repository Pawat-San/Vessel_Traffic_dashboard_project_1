const { ValidationError } = require('../utils/errors');

/**
 * Middleware factory for validating request components using Zod
 */
const validate = {
  body: (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return next(new ValidationError('Invalid body parameters', details));
    }
    req.body = result.data;
    next();
  },

  query: (schema) => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return next(new ValidationError('Invalid query parameters', details));
    }
    req.query = result.data;
    next();
  },

  params: (schema) => (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return next(new ValidationError('Invalid URL parameters', details));
    }
    req.params = result.data;
    next();
  },
};

module.exports = validate;
