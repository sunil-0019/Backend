import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { RULES } from '../../config/rules.js';
import { AppError } from '../../core/errors.js';
import { mailService } from '../mail/service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 1) return `${user}***@${domain}`;
  return `${user[0]}***@${domain}`;
}

export class OtpService {
  constructor() {
    this.handlers = new Map();
    this.loadHandlers();
  }

  async loadHandlers() {
    const handlersDir = path.join(__dirname, 'handlers');
    if (!fs.existsSync(handlersDir)) return;

    const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const fileUrl = new URL(`./handlers/${file}`, import.meta.url).href;
      const module = await import(fileUrl);
      const handler = module.default;
      if (handler && handler.purpose) {
        this.handlers.set(handler.purpose, handler);
      }
    }
  }

  getRules(purpose) {
    const rule = RULES.otp[purpose];
    if (!rule) {
      throw AppError.badRequest(`Unsupported OTP purpose: ${purpose}`);
    }
    return rule;
  }

  computeHash(subject, purpose, otp) {
    return crypto
      .createHmac('sha256', env.OTP_HMAC_SECRET)
      .update(`${subject}|${purpose}|${otp}`)
      .digest('hex');
  }

  /**
   * Distributed Lock to prevent race conditions during concurrent OTP operations
   */
  async withLock(lockKey, fn) {
    const lockVal = crypto.randomUUID();
    let acquired = false;
    const start = Date.now();

    while (!acquired && Date.now() - start < 4000) {
      const res = await redis.set(lockKey, lockVal, 'EX', 5, 'NX');
      if (res === 'OK') {
        acquired = true;
        break;
      }
      await new Promise(r => setTimeout(r, 20));
    }

    if (!acquired) {
      throw AppError.tooMany('Concurrent operation in progress, please retry.');
    }

    try {
      return await fn();
    } finally {
      try {
        const cur = await redis.get(lockKey);
        if (cur === lockVal) {
          await redis.del(lockKey);
        }
      } catch (_) {}
    }
  }

  /**
   * Send / Resend OTP (stored entirely in Redis with TTL)
   */
  async sendOtp({ subject, purpose, email, payload = {}, template = 'otp-signup', isResend = false }) {
    const rule = this.getRules(purpose);
    const normalizedSubject = subject.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    const limitKey = `otp:limit:${purpose}:${normalizedSubject}`;
    const activeOtpKey = `otp:active:${purpose}:${normalizedSubject}`;
    const lockKey = `lock:otp:${purpose}:${normalizedSubject}`;

    return this.withLock(lockKey, async () => {
      const now = new Date();
      const rawLimit = await redis.get(limitKey);
      let limit = null;
      if (rawLimit) {
        try {
          limit = typeof rawLimit === 'string' ? JSON.parse(rawLimit) : rawLimit;
        } catch (_) {}
      }

      // 0. If resend requested, enforce that initial send-otp was already called
      if (isResend) {
        if (!limit || limit.sendCount < 1) {
          throw AppError.badRequest(
            'No previous OTP request found. Please request an OTP first using Send OTP.',
            'OTP_NOT_SENT_YET'
          );
        }
      }

      // 1. Check if locked out (5 attempts exceeded within 24h)
      if (limit && limit.lockedUntil && new Date(limit.lockedUntil) > now) {
        const lockedUntilDate = new Date(limit.lockedUntil);
        const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilDate.getTime() - now.getTime()) / 1000));
        const dateStr = lockedUntilDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

        throw AppError.otpLocked(
          retryAfterSeconds,
          `Too many OTP requests. You can request a new OTP after 24 hours (at ${dateStr} IST).`
        );
      }

      // 2. Check 24h window expiration
      let sendCount = limit ? limit.sendCount : 0;
      let windowStartedAt = limit && limit.windowStartedAt ? new Date(limit.windowStartedAt) : now;
      const windowMillis = (rule.windowHours || 24) * 60 * 60 * 1000;

      if (limit && (now.getTime() - windowStartedAt.getTime() > windowMillis) && !limit.lockedUntil) {
        sendCount = 0;
        windowStartedAt = now;
      }

      sendCount += 1;
      const attempt = sendCount;

      // 3. Set lockout if sendCount hits maxSends (5 attempts)
      let lockedUntil = null;
      let limitTtlSeconds = (rule.windowHours || 24) * 60 * 60; // 24 hours
      if (sendCount >= rule.maxSends) {
        lockedUntil = new Date(now.getTime() + (rule.lockHours || 24) * 60 * 60 * 1000);
        limitTtlSeconds = (rule.lockHours || 24) * 60 * 60;
      } else {
        const elapsedSeconds = Math.floor((now.getTime() - windowStartedAt.getTime()) / 1000);
        limitTtlSeconds = Math.max(60, (rule.windowHours || 24) * 60 * 60 - elapsedSeconds);
      }

      // Save limit in Redis with 24-hour TTL and remember payload
      await redis.set(
        limitKey,
        JSON.stringify({
          sendCount,
          windowStartedAt: windowStartedAt.toISOString(),
          lockedUntil: lockedUntil ? lockedUntil.toISOString() : null,
          payload: { ...(limit?.payload || {}), ...payload },
        }),
        'EX',
        limitTtlSeconds
      );

      // 4. Generate 6-digit OTP
      const otpNumber = crypto.randomInt(0, 1000000);
      const otp = otpNumber.toString().padStart(rule.digits || 6, '0');
      const otpHash = this.computeHash(normalizedSubject, purpose, otp);

      const validityMinutes = rule.validityMinutes || 10;
      const expiresAt = new Date(now.getTime() + validityMinutes * 60 * 1000);

      // 5. Store active OTP in Redis with 10-minute TTL (automatically purged on expiry!)
      await redis.set(
        activeOtpKey,
        JSON.stringify({
          otpHash,
          attempt,
          wrongEntries: 0,
          payload,
          expiresAt: expiresAt.toISOString(),
        }),
        'EX',
        validityMinutes * 60
      );

      // 6. Queue/Send email notification
      const remaining = Math.max(0, rule.maxSends - attempt);
      const mailCtx = {
        otp,
        name: payload.name || '',
        attempt,
        maxAttempts: rule.maxSends,
        remaining,
        deviceName: payload.deviceName || '',
        city: payload.city || '',
      };

      await mailService.send(template, { email: normalizedEmail, name: payload.name }, mailCtx, { sync: true });

      return {
        message: 'OTP sent successfully to your email. Please check your inbox.',
        totalAttempts: rule.maxSends,
        attemptsLeft: remaining,
      };
    });
  }

  /**
   * Get current OTP status from Redis (e.g. app reopened)
   */
  async getStatus({ subject, purpose }) {
    const rule = this.getRules(purpose);
    const normalizedSubject = subject.trim().toLowerCase();

    const limitKey = `otp:limit:${purpose}:${normalizedSubject}`;
    const activeOtpKey = `otp:active:${purpose}:${normalizedSubject}`;

    const now = new Date();
    const rawLimit = await redis.get(limitKey);
    let limit = null;
    if (rawLimit) {
      try {
        limit = typeof rawLimit === 'string' ? JSON.parse(rawLimit) : rawLimit;
      } catch (_) {}
    }

    let attempt = 0;
    let lockedUntil = null;

    if (limit) {
      if (limit.lockedUntil && new Date(limit.lockedUntil) > now) {
        lockedUntil = new Date(limit.lockedUntil).toISOString();
        attempt = limit.sendCount;
      } else {
        const windowMillis = (rule.windowHours || 24) * 60 * 60 * 1000;
        if (now.getTime() - new Date(limit.windowStartedAt).getTime() <= windowMillis) {
          attempt = limit.sendCount;
        }
      }
    }

    const remaining = Math.max(0, rule.maxSends - attempt);

    // Check if active OTP exists and is not expired
    let otpActive = false;
    let otpExpiresAt = null;
    const rawActive = await redis.get(activeOtpKey);
    if (rawActive) {
      try {
        const activeData = typeof rawActive === 'string' ? JSON.parse(rawActive) : rawActive;
        if (new Date(activeData.expiresAt) > now) {
          otpActive = true;
          otpExpiresAt = new Date(activeData.expiresAt).toISOString();
        }
      } catch (_) {}
    }

    return {
      attempt,
      totalAttempts: rule.maxSends,
      maxAttempts: rule.maxSends,
      remaining,
      attemptsLeft: remaining,
      lockedUntil,
      otpActive,
      otpExpiresAt,
    };
  }

  /**
   * Verify an OTP cleanly from Redis and handle wrong entry attempts without deadlocks
   */
  async verifyOtp({ subject, purpose, otp }) {
    const rule = this.getRules(purpose);
    const normalizedSubject = subject.trim().toLowerCase();

    const activeOtpKey = `otp:active:${purpose}:${normalizedSubject}`;
    const limitKey = `otp:limit:${purpose}:${normalizedSubject}`;
    const lockKey = `lock:otp:${purpose}:${normalizedSubject}`;

    return this.withLock(lockKey, async () => {
      const rawActive = await redis.get(activeOtpKey);
      if (!rawActive) {
        throw AppError.badRequest('Invalid or consumed OTP.', 'OTP_INVALID');
      }

      let activeOtp;
      try {
        activeOtp = typeof rawActive === 'string' ? JSON.parse(rawActive) : rawActive;
      } catch (_) {
        throw AppError.badRequest('Invalid or consumed OTP.', 'OTP_INVALID');
      }

      const now = new Date();
      if (new Date(activeOtp.expiresAt) < now) {
        await redis.del(activeOtpKey);
        throw AppError.badRequest('OTP expired. Tap Resend OTP', 'OTP_EXPIRED');
      }

      // Timing-safe comparison of HMAC hashes
      const expectedHash = this.computeHash(normalizedSubject, purpose, (otp || '').trim());
      const actualHash = activeOtp.otpHash;

      const isMatch = actualHash && expectedHash &&
        actualHash.length === expectedHash.length &&
        crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));

      if (!isMatch) {
        const updatedWrong = (activeOtp.wrongEntries || 0) + 1;
        if (updatedWrong >= (rule.maxWrongEntries || 5)) {
          // Burn OTP immediately on 5 wrong entries
          await redis.del(activeOtpKey);
          throw AppError.badRequest(
            'Too many wrong attempts. This OTP has expired. Please request a new OTP.',
            'OTP_ATTEMPTS_EXCEEDED'
          );
        } else {
          activeOtp.wrongEntries = updatedWrong;
          const ttl = await redis.ttl(activeOtpKey);
          if (ttl > 0) {
            await redis.set(activeOtpKey, JSON.stringify(activeOtp), 'EX', ttl);
          }
          const attemptsLeft = (rule.maxWrongEntries || 5) - updatedWrong;
          throw AppError.badRequest(
            'Incorrect OTP. Please check and try again.',
            'OTP_INVALID',
            { attemptsLeft }
          );
        }
      }

      // Correct OTP: delete active OTP (single use) and reset limit!
      await redis.del(activeOtpKey);
      await redis.del(limitKey);

      const payload = activeOtp.payload || {};

      // Invoke purpose handler if present
      const handler = this.handlers.get(purpose);
      if (handler && typeof handler.onVerified === 'function') {
        await handler.onVerified({ subject: normalizedSubject, purpose, payload });
      }

      return {
        verified: true,
        payload,
      };
    });
  }
}

export const otpService = new OtpService();
