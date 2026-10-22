import { AppError } from '../core/errors.js';

export function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known AppError
  if (err instanceof AppError) {
    if (err.code === 'OTP_LOCKED' && err.details && err.details.retryAfterSeconds) {
      res.setHeader('Retry-After', err.details.retryAfterSeconds);
    }
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...err.details,
    });
  }

  // Handle PostgreSQL custom exception from forbid_email_update()
  if (err.message && err.message.includes('EMAIL_IMMUTABLE')) {
    return res.status(400).json({
      code: 'EMAIL_NOT_EDITABLE',
      message: 'Email address can never be edited.',
    });
  }

  // Handle PostgreSQL unique constraint violation
  if (err.code === '23505') {
    if (err.detail && err.detail.includes('email')) {
      return res.status(409).json({
        code: 'ACCOUNT_EXISTS',
        message: 'You already have a ChatLeaf account. Please sign in.',
      });
    }
    if (err.detail && err.detail.includes('user_id')) {
      return res.status(409).json({
        code: 'USER_ID_TAKEN',
        message: 'This User ID is already taken.',
      });
    }
    return res.status(409).json({
      code: 'CONFLICT',
      message: 'A resource with this identifier already exists.',
    });
  }

  // Handle PostgreSQL check constraint violation
  if (err.code === '23514') {
    return res.status(400).json({
      code: 'VALIDATION',
      message: 'Database check constraint failed on field format or length.',
    });
  }

  // Log unexpected errors
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled server error:', err);
  }

  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected internal error occurred. Please try again later.',
  });
}
