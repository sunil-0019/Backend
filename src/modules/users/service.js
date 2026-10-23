import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { bus } from '../../core/bus.js';
import { AppError } from '../../core/errors.js';
import { isIdAcceptable, generateUserId } from '../auth/userId.generator.js';
import { User, Session, UserIdHistory, LoginEvent } from '../../models/index.js';

export class UsersService {
  /**
   * Check if User ID is available or generate suggestions
   */
  async checkAvailability(rawId) {
    const checkId = rawId.toLowerCase().trim();
    const result = await isIdAcceptable(checkId);

    if (result.valid) {
      return {
        available: true,
        suggestions: [],
      };
    }

    const firstErr = result.errors[0];
    let reason = 'FORMAT';
    if (firstErr) {
      if (firstErr.error === 'USER_ID_TAKEN') reason = 'TAKEN';
      else if (firstErr.error === 'USER_ID_SIMILARITY') reason = 'TOO_SIMILAR';
      else if (firstErr.error === 'USER_ID_RESERVED') reason = 'RESERVED';
      else if (firstErr.error === 'USER_ID_PROFANITY') reason = 'PROFANITY';
    }

    // Generate 3 suggestions
    const suggestions = [];
    for (let i = 0; i < 3; i++) {
      try {
        const suggestion = await generateUserId(checkId);
        if (!suggestions.includes(suggestion)) {
          suggestions.push(suggestion);
        }
      } catch (err) {
        // Ignore fallback collision
      }
    }

    return {
      available: false,
      reason,
      suggestions,
    };
  }

  /**
   * Change User ID
   */
  async updateUserId(userUuid, { userId, ip = '127.0.0.1', deviceName = 'Device', platform = 'web', sessionId = null }) {
    const newUserId = userId.toLowerCase().trim();

    return db.withTransaction(async () => {
      // 1. Fetch user data
      const user = await User.findById(userUuid);
      if (!user) {
        throw AppError.notFound('User not found');
      }

      if (newUserId === user.userId.toLowerCase().trim()) {
        throw AppError.badRequest('New User ID must be different from current User ID.', 'SAME_USER_ID');
      }

      // 2. Cooldown check: Maximum 2 edits in a rolling 30-day window (1 month)
      const historyDocs = await UserIdHistory.find({
        userUuid,
        changedAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }).sort({ changedAt: 1 });

      if (historyDocs.length >= 2) {
        const oldestInWindow = new Date(historyDocs[0].changedAt);
        const nextAllowed = new Date(oldestInWindow.getTime() + 30 * 24 * 60 * 60 * 1000);
        const formattedDate = nextAllowed.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        throw AppError.forbidden(
          `You can only change your User ID 2 times every 1 month. Next edit available on ${formattedDate}.`,
          'USER_ID_COOLDOWN',
          { nextChangeAt: nextAllowed.toISOString() }
        );
      }

      // 3. Validate new User ID with rule pipeline
      const ruleCheck = await isIdAcceptable(newUserId, null, { exceptUserUuid: userUuid });
      if (!ruleCheck.valid) {
        const firstErr = ruleCheck.errors[0];
        throw AppError.badRequest(firstErr.message, firstErr.error);
      }

      const oldUserId = user.userId;
      const now = new Date();

      // 4. Reserve old ID for 30 days in user_id_history
      await UserIdHistory.create({
        _id: uuidv4(),
        userUuid,
        oldUserId,
        newUserId,
        changedAt: now,
        reservedUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      });

      // 5. Update user record
      user.userId = newUserId;
      user.userIdChangedAt = now;
      user.userIdChangeCount = (user.userIdChangeCount || 0) + 1;
      await user.save();

      // 6. Record login event
      await LoginEvent.create({
        _id: uuidv4(),
        userUuid,
        email: user.email,
        sessionId,
        kind: 'USER_ID_CHANGED',
        success: true,
        ip: ip.includes(':') ? '127.0.0.1' : ip,
        deviceName,
        platform,
      });

      const editsUsedInWindow = historyDocs.length + 1;
      const userIdEditAvailable = editsUsedInWindow < 2;
      let nextChangeAt = null;

      if (!userIdEditAvailable) {
        const earliestChange = historyDocs.length > 0 ? new Date(historyDocs[0].changedAt) : now;
        nextChangeAt = new Date(earliestChange.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      return {
        message: 'User ID updated successfully.',
        userId: newUserId,
        userIdEditAvailable,
        nextChangeAt,
      };
    });
  }

  /**
   * Update Profile (name, about) - Email is strictly immutable
   */
  async updateProfile(userUuid, { name, about, email }) {
    const user = await User.findById(userUuid);
    if (!user) throw AppError.notFound('User not found');

    if (email !== undefined) {
      const normalizedReqEmail = email.toLowerCase().trim();
      const currentEmail = user.email.toLowerCase().trim();
      if (normalizedReqEmail !== currentEmail) {
        throw AppError.badRequest('Email address can never be edited.', 'EMAIL_NOT_EDITABLE');
      }
    }

    if (name !== undefined) {
      user.name = name.trim();
      user.fullName = name.trim();
    }
    if (about !== undefined) {
      user.about = about.trim();
    }

    await user.save();

    return {
      id: user.id,
      userId: user.userId,
      email: user.email,
      name: user.name,
      about: user.about,
      photoUrl: user.photoKey,
    };
  }

  async updatePhoto(userUuid, photoKey) {
    const user = await User.findById(userUuid);
    if (!user) throw AppError.notFound('User not found');

    user.photoKey = photoKey;
    await user.save();
    return { photoUrl: user.photoKey };
  }

  async deletePhoto(userUuid) {
    const user = await User.findById(userUuid);
    if (!user) throw AppError.notFound('User not found');

    user.photoKey = null;
    await user.save();
    return { photoUrl: null };
  }

  async getProfile(userUuid) {
    const user = await User.findById(userUuid);
    if (!user) throw AppError.notFound('User not found');

    const historyDocs = await UserIdHistory.find({
      userUuid,
      changedAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }).sort({ changedAt: 1 });

    const editsInWindow = historyDocs.length;
    const userIdEditAvailable = editsInWindow < 2;
    let userIdNextEditAt = null;

    if (!userIdEditAvailable) {
      const oldestInWindow = new Date(historyDocs[0].changedAt);
      userIdNextEditAt = new Date(oldestInWindow.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    return {
      id: user.id,
      userId: user.userId,
      email: user.email,
      name: user.name || user.fullName,
      about: user.about,
      photoUrl: user.photoKey,
      userIdEditAvailable,
      userIdNextEditAt,
      createdAt: user.createdAt,
    };
  }

  async deleteAccount(userUuid) {
    const user = await User.findById(userUuid);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    // Revoke all sessions in Redis
    const sessions = await Session.find({ userUuid });
    for (const s of sessions) {
      await redis.set(`revoked:sid:${s.id}`, 'ACCOUNT_DELETED', 'EX', 1200);
    }

    // Delete user and sessions from DB
    await Session.deleteMany({ userUuid });
    await UserIdHistory.deleteMany({ userUuid });
    await LoginEvent.deleteMany({ userUuid });
    await User.deleteOne({ _id: userUuid });

    return {
      ok: true,
      message: 'Account and all associated sessions deleted successfully.',
    };
  }
}

export const usersService = new UsersService();
