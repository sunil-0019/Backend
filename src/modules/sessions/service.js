import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { bus } from '../../core/bus.js';
import { AppError } from '../../core/errors.js';
import { otpService } from '../otp/service.js';
import { Session, LoginEvent } from '../../models/index.js';

export class SessionsService {
  /**
   * List all linked devices for the user (current device first)
   */
  async listSessions(userUuid, currentSessionId) {
    // Auto-purge sessions inactive for more than 90 days (3 months)
    await Session.deleteMany({
      userUuid,
      $or: [
        { expiresAt: { $lt: new Date() } },
        { lastActiveAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      ],
    });

    const sessions = await Session.find({ userUuid }).sort({ createdAt: -1 });

    const now = Date.now();
    const sorted = [...sessions].sort((a, b) => (b.id === currentSessionId ? 1 : 0) - (a.id === currentSessionId ? 1 : 0));

    const items = sorted.map(row => {
      const isCurrent = row.id === currentSessionId;
      const isRecent = row.lastActiveAt && (now - new Date(row.lastActiveAt).getTime() < 5 * 60 * 1000);
      return {
        id: row.id,
        deviceName: row.deviceName || 'Unknown device',
        platform: row.platform || 'web',
        ip: row.ip || '127.0.0.1',
        activeNow: isCurrent || Boolean(isRecent),
        isCurrent,
        loginAt: row.createdAt,
        lastActiveAt: row.lastActiveAt,
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
      const otherSessions = await Session.find({ userUuid, _id: { $ne: currentSessionId } });
      if (otherSessions.length === 0) {
        throw AppError.badRequest('No other linked devices to remove.', 'NO_OTHER_DEVICES');
      }
      return { type: 'ALL', count: otherSessions.length, sessions: otherSessions };
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (isUUID) {
      if (str === currentSessionId) {
        throw AppError.badRequest('Use /auth/logout to sign out from the current device.', 'USE_LOGOUT');
      }
      const session = await Session.findOne({ _id: str, userUuid });
      if (!session) {
        throw AppError.notFound('Session not found or already removed.');
      }
      return { type: 'SINGLE', session };
    }

    // Check if integer position (1, 2, 3...)
    if (/^\d+$/.test(str)) {
      const pos = parseInt(str, 10);
      const otherSessions = await Session.find({ userUuid, _id: { $ne: currentSessionId } }).sort({ createdAt: -1 });
      if (pos < 1 || pos > otherSessions.length) {
        throw AppError.notFound(`No linked device found at position ${pos}.`);
      }
      return { type: 'SINGLE', session: otherSessions[pos - 1] };
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
        deviceName: session.deviceName || 'Linked Device',
        city: session.geoCity || '',
      },
      template: 'otp-remove-device',
    });

    return {
      ...result,
      sessionId: session.id,
      deviceName: session.deviceName,
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

      return db.withTransaction(async () => {
        const otherSessions = await Session.find({ userUuid, _id: { $ne: currentSessionId } });

        for (const s of otherSessions) {
          await redis.set(`revoked:sid:${s.id}`, 'REMOVED_BY_USER', 'EX', 1200);
        }

        await Session.deleteMany({ userUuid, _id: { $ne: currentSessionId } });

        await LoginEvent.create({
          _id: uuidv4(),
          userUuid,
          email: userEmail,
          sessionId: currentSessionId,
          kind: 'ALL_OTHER_DEVICES_REMOVED',
          success: true,
          ip: reqMeta.ip && !reqMeta.ip.includes(':') ? reqMeta.ip : '127.0.0.1',
          deviceName: 'All other devices',
          platform: 'all',
        });

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

    return db.withTransaction(async () => {
      const session = await Session.findOne({ _id: targetSessionId, userUuid });
      if (!session) {
        throw AppError.notFound('Session no longer exists.');
      }

      await Session.deleteOne({ _id: targetSessionId });
      await redis.set(`revoked:sid:${targetSessionId}`, 'REMOVED_BY_USER', 'EX', 1200);

      await LoginEvent.create({
        _id: uuidv4(),
        userUuid,
        email: userEmail,
        sessionId: targetSessionId,
        kind: 'DEVICE_REMOVED',
        success: true,
        ip: reqMeta.ip && !reqMeta.ip.includes(':') ? reqMeta.ip : '127.0.0.1',
        deviceName: session.deviceName,
        platform: session.platform,
      });

      bus.emit('session.removed', {
        name: userName,
        email: userEmail,
        deviceName: session.deviceName,
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
    const filter = { userUuid };
    if (cursor) {
      filter._id = { $lt: cursor };
    }

    const items = await LoginEvent.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();

    return {
      items,
      nextCursor: items.length > 0 ? items[items.length - 1]._id : null,
    };
  }
}

export const sessionsService = new SessionsService();
