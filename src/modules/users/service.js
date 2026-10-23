import { db } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { bus } from '../../core/bus.js';
import { AppError } from '../../core/errors.js';
import { isIdAcceptable, generateUserId } from '../auth/userId.generator.js';

export class UsersService {
  /**
   * Check if User ID is available or generate suggestions
   */
  async checkAvailability(rawId) {
    const checkId = rawId.toLowerCase().trim();
    const result = await isIdAcceptable(checkId, db);

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
        const suggestion = await generateUserId(checkId, db);
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

    return db.withTransaction(async (client) => {
      // 1. Fetch user data with lock
      const userResult = await client.query(
        `SELECT id, user_id, email, name, user_id_change_count, user_id_changed_at
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userUuid]
      );

      if (userResult.rows.length === 0) {
        throw AppError.notFound('User not found');
      }

      const user = userResult.rows[0];

      if (newUserId === user.user_id.toLowerCase().trim()) {
        throw AppError.badRequest('New User ID must be different from current User ID.', 'SAME_USER_ID');
      }

      // 2. Cooldown check: Maximum 2 edits in a rolling 30-day window (1 month)
      const historyRes = await client.query(
        `SELECT changed_at FROM user_id_history
         WHERE user_uuid = $1 AND changed_at > now() - interval '30 days'
         ORDER BY changed_at ASC`,
        [userUuid]
      );

      if (historyRes.rows.length >= 2) {
        const oldestInWindow = new Date(historyRes.rows[0].changed_at);
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
      const ruleCheck = await isIdAcceptable(newUserId, client, { exceptUserUuid: userUuid });
      if (!ruleCheck.valid) {
        const firstErr = ruleCheck.errors[0];
        throw AppError.badRequest(firstErr.message, firstErr.error);
      }

      const oldUserId = user.user_id;
      const now = new Date();

      // 4. Reserve old ID for 30 days in user_id_history
      await client.query(
        `INSERT INTO user_id_history (user_uuid, old_user_id, new_user_id, changed_at, reserved_until)
         VALUES ($1, $2, $3, now(), now() + interval '30 days')`,
        [userUuid, oldUserId, newUserId]
      );

      // 5. Update user record
      await client.query(
        `UPDATE users
         SET user_id = $1, user_id_changed_at = now(), user_id_change_count = user_id_change_count + 1
         WHERE id = $2`,
        [newUserId, userUuid]
      );

      // 6. Record login event
      await client.query(
        `INSERT INTO login_events (
           user_uuid, email, session_id, kind, success, ip, device_name, platform
         )
         VALUES ($1, $2, $3, 'USER_ID_CHANGED', true, $4::inet, $5, $6)`,
        [
          userUuid,
          user.email,
          sessionId,
          ip.includes(':') ? '127.0.0.1' : ip,
          deviceName,
          platform,
        ]
      );

      const editsUsedInWindow = historyRes.rows.length + 1;
      const userIdEditAvailable = editsUsedInWindow < 2;
      let nextChangeAt = null;

      if (!userIdEditAvailable) {
        // If 2 edits reached, earliest change in window + 30 days
        const earliestChange = historyRes.rows.length > 0 ? new Date(historyRes.rows[0].changed_at) : now;
        nextChangeAt = new Date(earliestChange.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      // No email notification on User ID change as per user requirement

      return {
        message: 'User ID updated successfully.',
        userId: newUserId,
        userIdEditAvailable,
        nextChangeAt,
      };
    });
  }

  /**
   * Delete user account permanently
   */
  async deleteAccount(userUuid) {
    return db.withTransaction(async (client) => {
      const sessions = await client.query(`SELECT id FROM sessions WHERE user_uuid = $1`, [userUuid]);
      for (const s of sessions.rows) {
        await redis.set(`revoked:sid:${s.id}`, 'ACCOUNT_DELETED', 'EX', 1200);
      }

      await client.query(`DELETE FROM users WHERE id = $1`, [userUuid]);

      return {
        ok: true,
        message: 'Your ChatLeaf account and all associated data have been permanently deleted.',
      };
    });
  }

  /**
   * Update Profile (name, about) - Email is strictly immutable
   */
  async updateProfile(userUuid, { name, about, email }) {
    // 1. Guard against attempting to edit email
    const currentUser = await db.query(`SELECT email FROM users WHERE id = $1`, [userUuid]);
    if (currentUser.rows.length === 0) throw AppError.notFound('User not found');

    if (email !== undefined) {
      const normalizedReqEmail = email.toLowerCase().trim();
      const currentEmail = currentUser.rows[0].email.toLowerCase().trim();
      if (normalizedReqEmail !== currentEmail) {
        throw AppError.badRequest('Email address can never be edited.', 'EMAIL_NOT_EDITABLE');
      }
    }

    const updates = [];
    const params = [userUuid];
    let idx = 2;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      params.push(name.trim());
    }

    if (about !== undefined) {
      updates.push(`about = $${idx++}`);
      params.push(about.trim());
    }

    if (updates.length === 0) {
      const res = await db.query(
        `SELECT id, user_id, email, name, about, photo_key AS "photoUrl" FROM users WHERE id = $1`,
        [userUuid]
      );
      return res.rows[0];
    }

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, user_id, email, name, about, photo_key AS "photoUrl"
    `;

    const result = await db.query(query, params);
    return result.rows[0];
  }

  async updatePhoto(userUuid, photoKey) {
    const res = await db.query(
      `UPDATE users SET photo_key = $1 WHERE id = $2 RETURNING photo_key AS "photoUrl"`,
      [photoKey, userUuid]
    );
    return res.rows[0];
  }

  async deletePhoto(userUuid) {
    await db.query(`UPDATE users SET photo_key = NULL WHERE id = $1`, [userUuid]);
    return { photoUrl: null };
  }

  async getProfile(userUuid) {
    const res = await db.query(
      `SELECT id, user_id, email, name, about, photo_key AS "photoUrl",
              user_id_changed_at, user_id_change_count, created_at
       FROM users WHERE id = $1`,
      [userUuid]
    );
    if (res.rows.length === 0) throw AppError.notFound('User not found');
    const u = res.rows[0];

    const historyRes = await db.query(
      `SELECT changed_at FROM user_id_history
       WHERE user_uuid = $1 AND changed_at > now() - interval '30 days'
       ORDER BY changed_at ASC`,
      [userUuid]
    );

    const editsInWindow = historyRes.rows.length;
    const userIdEditAvailable = editsInWindow < 2;
    let userIdNextEditAt = null;

    if (!userIdEditAvailable) {
      const oldestInWindow = new Date(historyRes.rows[0].changed_at);
      userIdNextEditAt = new Date(oldestInWindow.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    return {
      id: u.id,
      userId: u.user_id,
      email: u.email,
      name: u.name,
      about: u.about,
      photoUrl: u.photoUrl,
      userIdEditAvailable,
      userIdNextEditAt,
      createdAt: u.created_at,
    };
  }

  async deleteAccount(userUuid) {
    const userRes = await db.query(`SELECT id, email FROM users WHERE id = $1`, [userUuid]);
    if (userRes.rows.length === 0) {
      throw AppError.notFound('User not found');
    }

    // Revoke all sessions in Redis
    const sessionsRes = await db.query(`SELECT id FROM sessions WHERE user_uuid = $1`, [userUuid]);
    for (const s of sessionsRes.rows) {
      await redis.set(`revoked:sid:${s.id}`, 'ACCOUNT_DELETED', 'EX', 1200);
    }

    // Delete user from DB (cascades to sessions, user_id_history, login_events)
    await db.query(`DELETE FROM users WHERE id = $1`, [userUuid]);

    return {
      ok: true,
      message: 'Account and all associated sessions deleted successfully.',
    };
  }
}

export const usersService = new UsersService();
