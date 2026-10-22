import crypto, { randomBytes } from 'crypto';
import { db } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { bus } from '../../core/bus.js';
import { AppError } from '../../core/errors.js';
import { hashPassword, verifyPassword, signAccessToken } from '../../utils/crypto.js';
import { validatePassword } from '../auth/password.validator.js';
import { generatePassword } from '../auth/password.generator.js';
import { mailService } from '../mail/service.js';
import { otpService } from '../otp/service.js';

export class PasswordService {
  /**
   * Change Password (re-authenticates current, revokes all other sessions)
   */
  async changePassword(userUuid, currentSessionId, { currentPassword, newPassword, ip = '127.0.0.1', deviceName = 'Device', platform = 'web' }) {
    return db.withTransaction(async (client) => {
      // 1. Fetch user with lock
      const userRes = await client.query(
        `SELECT id, user_id, email, name, password_hash, token_version
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userUuid]
      );

      if (userRes.rows.length === 0) {
        throw AppError.notFound('User not found');
      }

      const user = userRes.rows[0];

      // 2. Verify current password
      const match = await verifyPassword(user.password_hash, currentPassword);
      if (!match) {
        throw AppError.unauthorized('Incorrect current password.', 'INVALID_CREDENTIALS');
      }

      // 3. Validate new password against rule pipeline
      const ruleCheck = await validatePassword(newPassword, {
        userId: user.user_id,
        email: user.email,
        currentPassword,
        fieldName: 'newPassword',
      });

      if (!ruleCheck.valid) {
        throw AppError.badRequest('Password does not meet complexity requirements.', 'PASSWORD_WEAK', {
          fields: ruleCheck.fields,
        });
      }

      // 4. Hash new password
      const newHash = await hashPassword(newPassword);

      // 5. Find other sessions to kick
      const otherSessionsRes = await client.query(
        `SELECT id FROM sessions WHERE user_uuid = $1 AND id <> $2`,
        [userUuid, currentSessionId]
      );

      const otherSessionIds = otherSessionsRes.rows.map(r => r.id);

      // 6. Set Redis revocation for other sessions
      for (const sid of otherSessionIds) {
        await redis.set(`revoked:sid:${sid}`, 'PASSWORD_CHANGED', 'EX', 1200);
      }

      // 7. Delete other sessions from database
      if (otherSessionIds.length > 0) {
        await client.query(
          `DELETE FROM sessions WHERE user_uuid = $1 AND id <> $2`,
          [userUuid, currentSessionId]
        );
      }

      // 8. Increment token_version and update password
      const updateRes = await client.query(
        `UPDATE users
         SET password_hash = $1, password_changed_at = now(), token_version = token_version + 1
         WHERE id = $2
         RETURNING token_version`,
        [newHash, userUuid]
      );

      const newTokenVersion = updateRes.rows[0].token_version;

      // 9. Generate fresh access token for current session
      const freshAccessToken = signAccessToken({
        sub: user.id,
        userId: user.user_id,
        sessionId: currentSessionId,
        tokenVersion: newTokenVersion,
      });

      // 10. Record login event
      await client.query(
        `INSERT INTO login_events (
           user_uuid, email, session_id, kind, success, ip, device_name, platform
         )
         VALUES ($1, $2, $3, 'PASSWORD_CHANGED', true, $4::inet, $5, $6)`,
        [
          userUuid,
          user.email,
          currentSessionId,
          ip.includes(':') ? '127.0.0.1' : ip,
          deviceName,
          platform,
        ]
      );

      // 11. Emit event for email alert
      bus.emit('user.passwordChanged', {
        name: user.name,
        email: user.email,
        deviceName,
        platform,
      });

      return {
        ok: true,
        message: 'Password updated successfully.',
        loggedOutDevices: otherSessionIds.length,
        tokens: {
          accessToken: freshAccessToken,
        },
      };
    });
  }

  /**
   * Send Forgot Password OTP
   */
  async sendForgotPasswordOtp(email) {
    const normalizedEmail = email.toLowerCase().trim();

    // Verify user exists
    const userRes = await db.query(`SELECT id, name FROM users WHERE email = $1`, [normalizedEmail]);
    if (userRes.rows.length === 0) {
      // For security, don't reveal user existence in production, or generic response
      return {
        sent: true,
        message: 'If an account exists with this email, an OTP has been sent.',
      };
    }

    const user = userRes.rows[0];

    return otpService.sendOtp({
      subject: normalizedEmail,
      purpose: 'forgotPassword',
      email: normalizedEmail,
      payload: { name: user.name },
      template: 'otp-forgot-password',
    });
  }

  /**
   * Reset Password with OTP
   */
  async resetPasswordWithOtp(email, otp, newPassword, ip = '127.0.0.1') {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Verify OTP
    await otpService.verifyOtp({
      subject: normalizedEmail,
      purpose: 'forgotPassword',
      otp,
    });

    return db.withTransaction(async (client) => {

      // 2. Fetch user
      const userRes = await client.query(
        `SELECT id, user_id, email, name FROM users WHERE email = $1 FOR UPDATE`,
        [normalizedEmail]
      );

      if (userRes.rows.length === 0) {
        throw AppError.notFound('User not found.');
      }

      const user = userRes.rows[0];

      // 3. Validate new password
      const ruleCheck = await validatePassword(newPassword, {
        userId: user.user_id,
        email: user.email,
        fieldName: 'newPassword',
      });

      if (!ruleCheck.valid) {
        throw AppError.badRequest('Password does not meet complexity requirements.', 'PASSWORD_WEAK', {
          fields: ruleCheck.fields,
        });
      }

      // 4. Hash new password
      const newHash = await hashPassword(newPassword);

      // 5. Revoke ALL sessions
      const sessions = await client.query(`SELECT id FROM sessions WHERE user_uuid = $1`, [user.id]);
      for (const s of sessions.rows) {
        await redis.set(`revoked:sid:${s.id}`, 'PASSWORD_CHANGED', 'EX', 1200);
      }
      await client.query(`DELETE FROM sessions WHERE user_uuid = $1`, [user.id]);

      // 6. Update user password and token_version
      await client.query(
        `UPDATE users
         SET password_hash = $1, password_changed_at = now(), token_version = token_version + 1,
             failed_login_count = 0, locked_until = NULL
         WHERE id = $2`,
        [newHash, user.id]
      );

      // 7. Log event
      await client.query(
        `INSERT INTO login_events (
           user_uuid, email, kind, success, ip, device_name, platform
         )
         VALUES ($1, $2, 'PASSWORD_CHANGED', true, $3::inet, 'Password Reset', 'web')`,
        [user.id, user.email, ip.includes(':') ? '127.0.0.1' : ip]
      );

      bus.emit('user.passwordChanged', {
        name: user.name,
        email: user.email,
        deviceName: 'Password Reset',
        platform: 'web',
      });

      return {
        ok: true,
        message: 'Password reset successful. Please sign in with your new password.',
      };
    });
  }

  /**
   * Send Forgot Password Magic Link
   */
  async sendForgotPasswordLink({ email, keepSessionId = null }) {
    const normalizedEmail = email.trim().toLowerCase();
    const userRes = await db.query(`SELECT id, email, name FROM users WHERE email = $1`, [normalizedEmail]);
    if (userRes.rows.length === 0) {
      throw AppError.notFound('No account found with this email address.');
    }
    const user = userRes.rows[0];

    // Check rate limit: 5 attempts per 24 hours
    const limitKey = `forgot:count:${normalizedEmail}`;
    const count = await redis.incr(limitKey);
    if (count === 1) {
      await redis.expire(limitKey, 24 * 60 * 60);
    }
    if (count > 5) {
      const ttl = await redis.ttl(limitKey);
      throw AppError.otpLocked(new Date(Date.now() + ttl * 1000).toISOString(), ttl, 'Too many reset requests. Please try again after 24 hours.');
    }

    const rawToken = randomBytes(32).toString('hex');
    // 10 minutes validity (600 seconds)
    await redis.set(`forgot:link:${rawToken}`, JSON.stringify({ userUuid: user.id, keepSessionId }), 'EX', 600);

    const resetLink = `${env.APP_BASE_URL}/api/v1/auth/forgot-password/reset?token=${rawToken}`;

    await mailService.send('forgot-password-link', { email: user.email, name: user.name }, {
      resetLink,
      resetToken: rawToken,
      name: user.name,
    }, { sync: true });

    return {
      message: 'Password reset link sent to your email. Click it within 10 minutes to generate a new password.',
    };
  }

  /**
   * Reset Password with Magic Link (Supports custom newPassword or auto-generates, single-use)
   */
  async resetPasswordWithLink({ token, newPassword = null }) {
    if (!token) throw AppError.badRequest('Reset token is required.');

    const rawVal = await redis.get(`forgot:link:${token}`);
    if (!rawVal) {
      throw AppError.badRequest('This password reset link is invalid, has expired, or has already been used. Please request a new link.', 'LINK_EXPIRED');
    }

    let userUuid;
    let keepSessionId = null;
    try {
      const parsed = JSON.parse(rawVal);
      if (typeof parsed === 'object' && parsed !== null) {
        userUuid = parsed.userUuid;
        keepSessionId = parsed.keepSessionId || null;
      } else {
        userUuid = rawVal;
      }
    } catch (_) {
      userUuid = rawVal;
    }

    return db.withTransaction(async (client) => {
      const userRes = await client.query(`SELECT id, email, name, user_id FROM users WHERE id = $1`, [userUuid]);
      if (userRes.rows.length === 0) throw AppError.notFound('User not found.');
      const user = userRes.rows[0];

      let chosenPassword = newPassword;
      let isAutogen = false;

      if (chosenPassword) {
        const ruleCheck = await validatePassword(chosenPassword, {
          userId: user.user_id,
          email: user.email,
          fieldName: 'newPassword',
        });
        if (!ruleCheck.valid) {
          throw AppError.badRequest('Password does not meet complexity requirements.', 'PASSWORD_WEAK', {
            fields: ruleCheck.fields,
          });
        }
      } else {
        chosenPassword = generatePassword();
        isAutogen = true;
      }

      const newHash = await hashPassword(chosenPassword);

      // Invalidate sessions:
      // If initiated from Profile with keepSessionId, revoke all OTHER sessions
      // If initiated from Login / public forgot password, revoke ALL sessions
      let sessions;
      if (keepSessionId) {
        sessions = await client.query(`SELECT id FROM sessions WHERE user_uuid = $1 AND id <> $2`, [user.id, keepSessionId]);
        await client.query(`DELETE FROM sessions WHERE user_uuid = $1 AND id <> $2`, [user.id, keepSessionId]);
      } else {
        sessions = await client.query(`SELECT id FROM sessions WHERE user_uuid = $1`, [user.id]);
        await client.query(`DELETE FROM sessions WHERE user_uuid = $1`, [user.id]);
      }

      for (const s of sessions.rows) {
        await redis.set(`revoked:sid:${s.id}`, 'PASSWORD_CHANGED', 'EX', 1200);
      }

      // Update password
      await client.query(
        `UPDATE users
         SET password_hash = $1, password_changed_at = now(), token_version = token_version + 1,
             failed_login_count = 0, locked_until = NULL
         WHERE id = $2`,
        [newHash, user.id]
      );

      // Delete token from Redis (single-use guarantee)
      await redis.del(`forgot:link:${token}`);

      if (isAutogen) {
        // Send new auto-generated password email
        await mailService.send('new-password-generated', { email: user.email, name: user.name }, {
          newPassword: chosenPassword,
          name: user.name,
          userId: user.user_id,
        }, { client });
      } else {
        // Send password updated security alert
        bus.emit('user.passwordChanged', {
          name: user.name,
          email: user.email,
          deviceName: 'Web Reset',
          platform: 'web',
        });
      }

      return {
        ok: true,
        message: isAutogen
          ? 'Your password has been reset. A brand new auto-generated password has been sent to your email.'
          : 'Password reset successful. All active sessions have been signed out.',
      };
    });
  }
}

export const passwordService = new PasswordService();
