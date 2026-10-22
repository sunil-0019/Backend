import { db } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { bus } from '../../core/bus.js';
import { AppError } from '../../core/errors.js';
import { otpService } from '../otp/service.js';

export class SessionsService {
  /**
   * List all linked devices for the user (current device first)
   */
  async listSessions(userUuid, currentSessionId) {
    // Auto-purge sessions inactive for more than 90 days (3 months)
    await db.query(
      `DELETE FROM sessions WHERE user_uuid = $1 AND (expires_at < now() OR last_active_at < now() - interval '90 days')`,
      [userUuid]
    );

    const res = await db.query(
      `SELECT id, device_name, platform, ip, geo_city, geo_country,
              created_at AS login_at, last_active_at
       FROM sessions
       WHERE user_uuid = $1
       ORDER BY (id = $2) DESC, created_at DESC`,
      [userUuid, currentSessionId]
    );

    const now = Date.now();
    const items = res.rows.map(row => {
      const isCurrent = row.id === currentSessionId;
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

    return {
      count: items.length,
      items,
    };
  }

  /**
   * Resolve target session ID: can be a UUID, position number ('1', '2', 1, 2), or 'all'/'remove-all'
   */
  async resolveTargetSession(userUuid, currentSessionId, identifier) {
    if (!identifier) {
      throw AppError.badRequest('Session identifier or position is required.');
    }

    const str = String(identifier).trim().toLowerCase();

    if (str === 'all' || str === 'remove-all') {
      const otherRes = await db.query(
        `SELECT id, device_name FROM sessions WHERE user_uuid = $1 AND id <> $2`,
        [userUuid, currentSessionId]
      );
      if (otherRes.rows.length === 0) {
        throw AppError.badRequest('No other linked devices to remove.', 'NO_OTHER_DEVICES');
      }
      return { type: 'ALL', count: otherRes.rows.length, sessions: otherRes.rows };
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (isUUID) {
      if (str === currentSessionId) {
        throw AppError.badRequest('Use /auth/logout to sign out from the current device.', 'USE_LOGOUT');
      }
      const res = await db.query(
        `SELECT id, device_name, geo_city, platform, ip FROM sessions WHERE id = $1 AND user_uuid = $2`,
        [str, userUuid]
      );
      if (res.rows.length === 0) {
        throw AppError.notFound('Session not found or already removed.');
      }
      return { type: 'SINGLE', session: res.rows[0] };
    }

    // Check if integer position (1, 2, 3...)
    if (/^\d+$/.test(str)) {
      const pos = parseInt(str, 10);
      const otherRes = await db.query(
        `SELECT id, device_name, geo_city, platform, ip FROM sessions
         WHERE user_uuid = $1 AND id <> $2
         ORDER BY created_at DESC`,
        [userUuid, currentSessionId]
      );
      if (pos < 1 || pos > otherRes.rows.length) {
        throw AppError.notFound(`No linked device found at position ${pos}.`);
      }
      return { type: 'SINGLE', session: otherRes.rows[pos - 1] };
    }

    throw AppError.badRequest('Invalid session ID or position.');
  }

  /**
   * Send OTP to remove a linked device (single or all other devices)
   */
  async sendRemoveDeviceOtp(userUuid, targetIdentifier, userEmail, currentSessionId) {
    const target = await this.resolveTargetSession(userUuid, currentSessionId, targetIdentifier);

    if (target.type === 'ALL') {
      const subject = `${userUuid}:remove-all`;
      const result = await otpService.sendOtp({
        subject,
        purpose: 'removeAllDevices',
        email: userEmail,
        payload: {
          deviceName: `All other linked devices (${target.count})`,
          city: '',
        },
        template: 'otp-remove-device',
      });
      return {
        ...result,
        mode: 'ALL',
        deviceCount: target.count,
      };
    }

    const session = target.session;
    const subject = `${userUuid}:${session.id}`;

    const result = await otpService.sendOtp({
      subject,
      purpose: 'removeDevice',
      email: userEmail,
      payload: {
        sessionId: session.id,
        deviceName: session.device_name || 'Linked Device',
        city: session.geo_city || '',
      },
      template: 'otp-remove-device',
    });

    return {
      ...result,
      sessionId: session.id,
      deviceName: session.device_name,
    };
  }

  /**
   * Status of device removal OTP
   */
  async getRemoveDeviceStatus(userUuid, targetIdentifier, currentSessionId) {
    const target = await this.resolveTargetSession(userUuid, currentSessionId, targetIdentifier);
    if (target.type === 'ALL') {
      return otpService.getStatus({
        subject: `${userUuid}:remove-all`,
        purpose: 'removeAllDevices',
      });
    }
    return otpService.getStatus({
      subject: `${userUuid}:${target.session.id}`,
      purpose: 'removeDevice',
    });
  }

  /**
   * Confirm device removal with OTP
   */
  async confirmRemoveDevice(userUuid, targetIdentifier, otp, userEmail, userName, reqMeta = {}, currentSessionId) {
    const target = await this.resolveTargetSession(userUuid, currentSessionId, targetIdentifier);

    if (target.type === 'ALL') {
      await otpService.verifyOtp({
        subject: `${userUuid}:remove-all`,
        purpose: 'removeAllDevices',
        otp,
      });

      return db.withTransaction(async (client) => {
        const otherSessionsRes = await client.query(
          `SELECT id, device_name FROM sessions WHERE user_uuid = $1 AND id <> $2`,
          [userUuid, currentSessionId]
        );
        const otherSessions = otherSessionsRes.rows;

        for (const s of otherSessions) {
          await redis.set(`revoked:sid:${s.id}`, 'REMOVED_BY_USER', 'EX', 1200);
        }

        await client.query(
          `DELETE FROM sessions WHERE user_uuid = $1 AND id <> $2`,
          [userUuid, currentSessionId]
        );

        await client.query(
          `INSERT INTO login_events (
             user_uuid, email, session_id, kind, success, ip, device_name, platform
           )
           VALUES ($1, $2, $3, 'ALL_OTHER_DEVICES_REMOVED', true, $4::inet, 'All other devices', 'all')`,
          [
            userUuid,
            userEmail,
            currentSessionId,
            reqMeta.ip && !reqMeta.ip.includes(':') ? reqMeta.ip : '127.0.0.1',
          ]
        );

        bus.emit('session.removed', {
          name: userName,
          email: userEmail,
          deviceName: 'All other linked devices',
        });

        return {
          ok: true,
          message: 'All other linked devices removed successfully.',
          removedCount: otherSessions.length,
        };
      });
    }

    const targetSessionId = target.session.id;
    const subject = `${userUuid}:${targetSessionId}`;

    await otpService.verifyOtp({
      subject,
      purpose: 'removeDevice',
      otp,
    });

    return db.withTransaction(async (client) => {
      const sessionRes = await client.query(
        `SELECT id, device_name, platform, ip FROM sessions WHERE id = $1 AND user_uuid = $2`,
        [targetSessionId, userUuid]
      );

      if (sessionRes.rows.length === 0) {
        throw AppError.notFound('Session no longer exists.');
      }

      const session = sessionRes.rows[0];

      await client.query(`DELETE FROM sessions WHERE id = $1`, [targetSessionId]);
      await redis.set(`revoked:sid:${targetSessionId}`, 'REMOVED_BY_USER', 'EX', 1200);

      await client.query(
        `INSERT INTO login_events (
           user_uuid, email, session_id, kind, success, ip, device_name, platform
         )
         VALUES ($1, $2, $3, 'DEVICE_REMOVED', true, $4::inet, $5, $6)`,
        [
          userUuid,
          userEmail,
          targetSessionId,
          reqMeta.ip && !reqMeta.ip.includes(':') ? reqMeta.ip : '127.0.0.1',
          session.device_name,
          session.platform,
        ]
      );

      bus.emit('session.removed', {
        name: userName,
        email: userEmail,
        deviceName: session.device_name,
      });

      return {
        ok: true,
        message: 'Device removed successfully.',
        removedSessionId: targetSessionId,
      };
    });
  }

  /**
   * Get login history
   */
  async getLoginHistory(userUuid, { limit = 20, cursor = null } = {}) {
    let query = `
      SELECT id, kind, success, reason, ip, geo_city, geo_country, device_name, platform, created_at
      FROM login_events
      WHERE user_uuid = $1
    `;
    const params = [userUuid];

    if (cursor) {
      query += ` AND id < $2`;
      params.push(cursor);
    }

    query += ` ORDER BY id DESC LIMIT $${params.length + 1}`;
    params.push(Math.min(limit, 100));

    const res = await db.query(query, params);
    return {
      items: res.rows,
      nextCursor: res.rows.length > 0 ? res.rows[res.rows.length - 1].id : null,
    };
  }
}

export const sessionsService = new SessionsService();
