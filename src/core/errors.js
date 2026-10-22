export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code = 'BAD_REQUEST', details = {}) {
    return new AppError(message, 400, code, details);
  }

  static validation(message = 'Validation failed', fields = []) {
    return new AppError(message, 400, 'VALIDATION', { fields });
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED', details = {}) {
    return new AppError(message, 401, code, details);
  }

  static sessionRevoked(reason = 'SESSION_REVOKED', message = 'Session has been revoked') {
    return new AppError(message, 401, 'SESSION_REVOKED', { reason });
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN', details = {}) {
    return new AppError(message, 403, code, details);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(message, 404, code);
  }

  static conflict(message = 'Resource already exists', code = 'CONFLICT', details = {}) {
    return new AppError(message, 409, code, details);
  }

  static accountLocked(lockedUntil, message = 'Account temporarily locked') {
    return new AppError(message, 423, 'ACCOUNT_LOCKED', { lockedUntil });
  }

  static otpLocked(retryAfterSeconds, message, extra = {}) {
    return new AppError(message, 429, 'OTP_LOCKED', {
      retryAfterSeconds,
      ...extra,
    });
  }

  static emailSendFailed(message = 'Failed to send verification email') {
    return new AppError(message, 502, 'EMAIL_SEND_FAILED');
  }
}
