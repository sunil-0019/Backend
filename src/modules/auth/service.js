import { db } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { bus } from '../../core/bus.js';
import { AppError } from '../../core/errors.js';
import { mailService } from '../mail/service.js';
import { otpService } from '../otp/service.js';
import { generateUserId } from './userId.generator.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
} from '../../utils/crypto.js';

export class AuthService {
  /**
   * Send Signup OTP
   */
  async sendSignupOtp({ name, email }) {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check if email already registered
    const existing = await db.query(
      `SELECT 1 FROM users WHERE email = $1 LIMIT 1`,
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      throw AppError.conflict('You already have a ChatLeaf account. Please sign in.', 'ACCOUNT_EXISTS');
    }

    // 2. Dispatch OTP via central engine
    return otpService.sendOtp({
      subject: normalizedEmail,
      purpose: 'signup',
      email: normalizedEmail,
      payload: { name: name.trim() },
      template: 'otp-signup',
    });
  }

  /**
   * Resend Signup OTP
   */
  async resendSignupOtp({ email }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already registered
    const existing = await db.query(
      `SELECT 1 FROM users WHERE email = $1 LIMIT 1`,
      [normalizedEmail]
    );
    if (existing.rows.length > 0) {
      throw AppError.conflict('You already have a ChatLeaf account. Please sign in.', 'ACCOUNT_EXISTS');
    }

    return otpService.sendOtp({
      subject: normalizedEmail,
      purpose: 'signup',
      email: normalizedEmail,
      template: 'otp-signup',
      isResend: true,
    });
  }

  /**
   * Verify Signup & Create Account
   */
  async verifySignup({ email, otp, device = {}, ip = '127.0.0.1' }) {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check OTP
    const verified = await otpService.verifyOtp({
      subject: normalizedEmail,
      purpose: 'signup',
      otp,
    });

    const name = (verified.payload && verified.payload.name) ? verified.payload.name : 'User';

    return db.withTransaction(async (client) => {
      // 2. Generate unique and acceptable User ID (with advisory lock)
      const userId = await generateUserId(name, client);

      // 3. Create user (100% passwordless / OTP authentication)
      const userResult = await client.query(
        `INSERT INTO users (
           user_id, email, name, about, photo_key,
           status, token_version, first_login_at, last_login_at
         )
         VALUES ($1, $2, $3, 'Hey there, using ChatLeaf', NULL, 'ACTIVE', 0, now(), now())
         RETURNING id, user_id, email, name, about, photo_key, created_at, token_version`,
        [userId, normalizedEmail, name]
      );
      const user = userResult.rows[0];

      // 4. Generate Refresh & Access Tokens
      const rawRefreshToken = generateRefreshToken();
      const refreshHash = hashToken(rawRefreshToken);

      const sessionResult = await client.query(
        `INSERT INTO sessions (
           user_uuid, device_id, device_name, model, platform, app_version,
           ip, refresh_hash, created_at, last_active_at, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, now(), now(), now() + interval '90 days')
         RETURNING id, device_name, platform, created_at, last_active_at`,
        [
          user.id,
          device.deviceId || null,
          device.deviceName || 'Primary Device',
          device.model || null,
          device.platform || 'unknown',
          device.appVersion || null,
          ip.includes(':') ? '127.0.0.1' : ip, // fallback to standard ipv4 for inet if ipv6 localhost
          refreshHash,
        ]
      );
      const session = sessionResult.rows[0];

      const accessToken = signAccessToken({
        sub: user.id,
        userId: user.user_id,
        sessionId: session.id,
        tokenVersion: user.token_version,
      });

      // 5. Record login event
      await client.query(
        `INSERT INTO login_events (
           user_uuid, email, session_id, kind, success, ip, device_name, platform
         )
         VALUES ($1, $2, $3, 'SIGNUP', true, $4::inet, $5, $6)`,
        [
          user.id,
          user.email,
          session.id,
          ip.includes(':') ? '127.0.0.1' : ip,
          session.device_name,
          session.platform,
        ]
      );

      // Prepare welcome and security email contexts
      const createdAtDate = new Date(user.created_at);
      const emailPayload = {
        name: user.name,
        userId: user.user_id,
        email: user.email,
        createdAtIST: createdAtDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        createdAtUTC: createdAtDate.toUTCString(),
      };

      // Send welcome email (committed in same transaction)
      await mailService.send('welcome', { email: user.email, name: user.name }, emailPayload, { client });
      bus.emit('session.created', { userId: user.id, sessionId: session.id });

      return {
        message: 'Account created successfully. Welcome to ChatLeaf!',
        user: {
          id: user.id,
          userId: user.user_id,
          name: user.name,
          email: user.email,
          about: user.about,
          photoUrl: user.photo_key,
          createdAt: user.created_at,
        },
        tokens: {
          accessToken,
          refreshToken: rawRefreshToken,
          sessionId: session.id,
        },
        linkedDevices: {
          count: 1,
          items: [
            {
              id: session.id,
              deviceName: session.device_name || 'Chrome · Windows',
              platform: session.platform || 'web',
              ip: session.ip ? session.ip.toString() : (ip || '127.0.0.1'),
              activeNow: true,
              isCurrent: true,
              loginAt: session.created_at,
              lastActiveAt: session.last_active_at || session.created_at,
            },
          ],
        },
      };
    });
  }


  /**
   * Refresh Token
   */
  async refresh({ refreshToken, sessionId }) {
    const sessionResult = await db.query(
      `SELECT s.*, u.id AS user_id, u.user_id AS user_handle, u.status, u.token_version
       FROM sessions s
       JOIN users u ON u.id = s.user_uuid
       WHERE s.id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw AppError.sessionRevoked('SESSION_REVOKED', 'Session expired or removed.');
    }

    const session = sessionResult.rows[0];

    // Verify session validity (3 months / 90 days validity window)
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      await db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
      throw AppError.sessionRevoked('SESSION_EXPIRED', 'Session expired. Please log in again.');
    }

    if (session.status !== 'ACTIVE') {
      throw AppError.forbidden('Account is not active.');
    }

    const providedHash = hashToken(refreshToken);

    // Verify current refresh hash
    if (!providedHash.equals(session.refresh_hash)) {
      // Possible reuse attack! Invalidate session immediately
      await db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
      throw AppError.sessionRevoked('TOKEN_REUSE', 'Invalid refresh token. Session revoked for security.');
    }

    // Rotate refresh token (Sliding window: old token invalid, new token valid for 90 days / 3 months)
    const newRawRefreshToken = generateRefreshToken();
    const newRefreshHash = hashToken(newRawRefreshToken);

    await db.query(
      `UPDATE sessions
       SET prev_refresh_hash = refresh_hash, refresh_hash = $1, last_active_at = now(), expires_at = now() + interval '90 days'
       WHERE id = $2`,
      [newRefreshHash, sessionId]
    );

    const accessToken = signAccessToken({
      sub: session.user_uuid,
      userId: session.user_handle,
      sessionId: session.id,
      tokenVersion: session.token_version,
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Logout current session
   */
  async logout(sessionId) {
    await db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    return { ok: true, message: 'Logged out successfully.' };
  }

  /**
   * Send Login OTP (Email or User ID)
   */
  async sendLoginOtp({ identifier }) {
    const rawIdentifier = identifier.trim();
    const isEmail = rawIdentifier.includes('@');
    const lookupParam = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

    const query = isEmail
      ? `SELECT id, user_id, email, name, status, locked_until FROM users WHERE email = $1`
      : `SELECT id, user_id, email, name, status, locked_until FROM users WHERE user_id = $1`;

    const userResult = await db.query(query, [lookupParam]);
    if (userResult.rows.length === 0) {
      throw AppError.notFound('No account found with this User ID or email.');
    }

    const user = userResult.rows[0];
    if (user.status !== 'ACTIVE') {
      throw AppError.forbidden('This account is not active.');
    }

    const result = await otpService.sendOtp({
      subject: user.email,
      email: user.email,
      purpose: 'login',
      template: 'otp-login',
      payload: {
        name: user.name,
        userUuid: user.id,
        userId: user.user_id,
      },
    });

    return result;
  }

  /**
   * Verify Login OTP and sign in (preserves other active sessions, max 3 devices)
   */
  async verifyLoginOtp({ identifier, otp, device = {}, ip = '127.0.0.1' }) {
    const rawIdentifier = identifier.trim();
    const isEmail = rawIdentifier.includes('@');
    const lookupParam = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

    const query = isEmail
      ? `SELECT id, user_id, email, name, about, photo_key, status, locked_until, token_version FROM users WHERE email = $1`
      : `SELECT id, user_id, email, name, about, photo_key, status, locked_until, token_version FROM users WHERE user_id = $1`;

    const userResult = await db.query(query, [lookupParam]);
    if (userResult.rows.length === 0) {
      throw AppError.notFound('No account found with this User ID or email.');
    }

    const user = userResult.rows[0];
    if (user.status !== 'ACTIVE') {
      throw AppError.forbidden('This account is not active.');
    }

    // 1. Verify OTP
    await otpService.verifyOtp({
      subject: user.email,
      purpose: 'login',
      otp,
    });

    const deviceName = device.deviceName || 'Chrome · Windows';
    const platform = device.platform || 'web';
    const deviceId = device.deviceId || null;

    // 2. Auto-purge sessions inactive for more than 90 days (3 months)
    await db.query(
      `DELETE FROM sessions WHERE user_uuid = $1 AND (expires_at < now() OR last_active_at < now() - interval '90 days')`,
      [user.id]
    );

    // 3. Check if an existing session already exists for this same physical device
    const existingSameDevice = await db.query(
      `SELECT id FROM sessions
       WHERE user_uuid = $1
         AND (
           ($2::text IS NOT NULL AND device_id = $2)
           OR (device_id IS NULL AND device_name = $3 AND platform = $4)
         )`,
      [user.id, deviceId, deviceName, platform]
    );

    // If logging in on same device again, revoke old session so no duplicate sessions exist
    if (existingSameDevice.rows.length > 0) {
      for (const oldRow of existingSameDevice.rows) {
        await db.query(`DELETE FROM sessions WHERE id = $1`, [oldRow.id]);
        await redis.set(`revoked:sid:${oldRow.id}`, 'NEW_LOGIN_SAME_DEVICE', 'EX', 1200);
      }
    } else {
      // Different device: check 3 active devices limit
      const activeSessionsCount = await db.query(
        `SELECT COUNT(*)::int AS count FROM sessions WHERE user_uuid = $1`,
        [user.id]
      );
      if (activeSessionsCount.rows[0].count >= 3) {
        throw AppError.forbidden(
          'Maximum 3 devices can be logged in at the same time. Please remove an older device first.',
          'DEVICE_LIMIT_REACHED'
        );
      }
    }

    // 4. Create new session (does NOT kick other logged-in devices!)
    const rawRefreshToken = generateRefreshToken();
    const refreshHash = hashToken(rawRefreshToken);

    const sessionResult = await db.query(
      `INSERT INTO sessions (
         user_uuid, device_id, device_name, model, platform, app_version,
         ip, refresh_hash, created_at, last_active_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, now(), now(), now() + interval '90 days')
       RETURNING id, device_name, platform, ip, geo_city, geo_country, created_at, last_active_at`,
      [
        user.id,
        deviceId,
        deviceName,
        device.model || null,
        platform,
        device.appVersion || null,
        ip.includes(':') ? '127.0.0.1' : ip,
        refreshHash,
      ]
    );
    const session = sessionResult.rows[0];

    // 5. Generate Access Token
    const accessToken = signAccessToken({
      sub: user.id,
      userId: user.user_id,
      sessionId: session.id,
      tokenVersion: user.token_version,
    });

    // 6. Record login event
    await db.query(
      `INSERT INTO login_events (
         user_uuid, email, session_id, kind, success, ip, device_name, platform
       )
       VALUES ($1, $2, $3, 'LOGIN_OTP', true, $4::inet, $5, $6)`,
      [
        user.id,
        user.email,
        session.id,
        ip.includes(':') ? '127.0.0.1' : ip,
        session.device_name,
        session.platform,
      ]
    );

    // 7. Emit login event (sends login alert email)
    bus.emit('user.loggedIn', {
      userUuid: user.id,
      email: user.email,
      name: user.name,
      sessionId: session.id,
      deviceName: session.device_name,
      platform: session.platform,
      ip: session.ip || ip,
      city: session.geo_city,
      country: session.geo_country,
      loginAt: session.created_at,
    });
    bus.emit('auth.login', {
      userUuid: user.id,
      email: user.email,
      name: user.name,
      sessionId: session.id,
      deviceName: session.device_name,
      platform: session.platform,
      ip: session.ip || ip,
      city: session.geo_city,
      country: session.geo_country,
      loginAt: session.created_at,
    });

    // 8. Fetch linked devices
    const devicesResult = await db.query(
      `SELECT id, device_name, platform, ip, geo_city, geo_country,
              created_at AS login_at, last_active_at
       FROM sessions
       WHERE user_uuid = $1
       ORDER BY (id = $2) DESC, created_at DESC`,
      [user.id, session.id]
    );

    const now = Date.now();
    const items = devicesResult.rows.map(row => {
      const isCurrent = row.id === session.id;
      const isRecent = row.last_active_at && (now - new Date(row.last_active_at).getTime() < 5 * 60 * 1000);
      return {
        id: row.id,
        deviceName: row.device_name || 'Unknown device',
        platform: row.platform || 'web',
        ip: row.ip ? row.ip.toString() : '127.0.0.1',
        activeNow: isCurrent || Boolean(isRecent),
        isCurrent,
        loginAt: row.login_at,
        lastActiveAt: row.last_active_at,
      };
    });

    // Check user_id edit availability (max 2 edits in 30 days)
    const historyRes = await db.query(
      `SELECT changed_at FROM user_id_history
       WHERE user_uuid = $1 AND changed_at > now() - interval '30 days'
       ORDER BY changed_at ASC`,
      [user.id]
    );
    const userIdEditAvailable = historyRes.rows.length < 2;

    return {
      message: 'Login successful.',
      user: {
        id: user.id,
        userId: user.user_id,
        name: user.name,
        email: user.email,
        about: user.about,
        photoUrl: user.photo_key,
        userIdEditAvailable,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        sessionId: session.id,
      },
      linkedDevices: {
        count: items.length,
        items,
      },
    };
  }

  /**
   * Resend Login OTP
   */
  async resendLoginOtp({ identifier }) {
    const rawIdentifier = identifier.trim();
    const isEmail = rawIdentifier.includes('@');
    const lookupParam = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

    const query = isEmail
      ? `SELECT id, user_id, email, name, status, locked_until FROM users WHERE email = $1`
      : `SELECT id, user_id, email, name, status, locked_until FROM users WHERE user_id = $1`;

    const userResult = await db.query(query, [lookupParam]);
    if (userResult.rows.length === 0) {
      throw AppError.notFound('No account found with this User ID or email.');
    }

    const user = userResult.rows[0];
    if (user.status !== 'ACTIVE') {
      throw AppError.forbidden('This account is not active.');
    }

    return otpService.sendOtp({
      subject: user.email,
      email: user.email,
      purpose: 'login',
      template: 'otp-login',
      payload: {
        name: user.name,
        userUuid: user.id,
        userId: user.user_id,
      },
      isResend: true,
    });
  }
}

export const authService = new AuthService();
