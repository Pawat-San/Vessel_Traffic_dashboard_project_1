class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Not authorized to access this resource') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class PasswordChangeRequiredError extends AppError {
  constructor(message = 'Password change required before continuing', details = null) {
    super(message, 403, 'PASSWORD_CHANGE_REQUIRED', details);
  }
}

class PasswordRecentlyUsedError extends AppError {
  constructor(message = 'This password was used recently. Choose a password different from your last 5 passwords.') {
    super(message, 400, 'PASSWORD_RECENTLY_USED');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict occurred') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  PasswordChangeRequiredError,
  PasswordRecentlyUsedError,
  NotFoundError,
  ConflictError,
  InternalError,
};
