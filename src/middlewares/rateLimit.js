import { redis } from '../config/redis.js';
import { AppError } from '../core/errors.js';

export function rateLimiter({ keyPrefix, limit, windowSeconds }) {
  return async (req, res, next) => {
    // In test environment, bypass rate limit unless explicitly testing rate limits
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const key = `ratelimit:${keyPrefix}:${ip}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (current > limit) {
        const ttl = await redis.ttl(key);
        const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
        res.setHeader('Retry-After', retryAfterSeconds);
        return next(
          AppError.tooMany(
            'Too many requests from this network. Please try again later.',
            'RATE_LIMITED',
            { retryAfterSeconds }
          )
        );
      }

      next();
    } catch (err) {
      // If redis is unavailable, fail open to prevent blocking legitimate users
      next();
    }
  };
}

export const sendOtpLimiter = rateLimiter({
  keyPrefix: 'send_otp',
  limit: 100,
  windowSeconds: 3600, // 100 per hour per IP (Bot/DDoS protection)
});

export const verifyOtpLimiter = rateLimiter({
  keyPrefix: 'verify_otp',
  limit: 100,
  windowSeconds: 3600, // 100 per hour per IP
});

export const loginLimiter = rateLimiter({
  keyPrefix: 'login',
  limit: 60,
  windowSeconds: 60, // 60 per min per IP
});
