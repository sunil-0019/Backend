import { verifyAccessToken } from '../utils/crypto.js';
import { redis } from '../config/redis.js';
import { db } from '../config/db.js';
import { AppError } from '../core/errors.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(AppError.unauthorized('Authentication token required', 'UNAUTHORIZED'));
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    if (!payload || !payload.sub || !payload.sessionId) {
      return next(AppError.unauthorized('Invalid or expired token', 'UNAUTHORIZED'));
    }

    // Check Redis revocation
    const revokedReason = await redis.get(`revoked:sid:${payload.sessionId}`).catch(() => null);
    if (revokedReason) {
      const message = revokedReason === 'PASSWORD_CHANGED'
        ? 'Your password was changed. Please sign in with your new password.'
        : 'Your session has been revoked. Please sign in again.';
      return next(AppError.sessionRevoked(revokedReason, message));
    }

    // Check database user and session
    const result = await db.query(
      `SELECT u.id, u.user_id, u.email, u.name, u.about, u.photo_key, u.status, u.token_version,
              u.user_id_changed_at, u.user_id_change_count,
              s.id AS session_id, s.device_name, s.platform
       FROM users u
       JOIN sessions s ON s.user_uuid = u.id
       WHERE u.id = $1 AND s.id = $2`,
      [payload.sub, payload.sessionId]
    );

    if (result.rows.length === 0) {
      return next(AppError.sessionRevoked('SESSION_REVOKED', 'Session no longer exists.'));
    }

    const row = result.rows[0];

    // Check user status
    if (row.status !== 'ACTIVE') {
      return next(AppError.forbidden(`Account status is ${row.status}`, 'ACCOUNT_INACTIVE'));
    }

    // Check token version
    if (typeof payload.tokenVersion === 'number' && row.token_version !== payload.tokenVersion) {
      return next(AppError.sessionRevoked('PASSWORD_CHANGED', 'Your password was changed. Please sign in with your new password.'));
    }

    // Throttled update of last_active_at (e.g. fire-and-forget)
    db.query('UPDATE sessions SET last_active_at = now() WHERE id = $1', [row.session_id]).catch(() => {});

    req.user = {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      name: row.name,
      about: row.about,
      photoUrl: row.photo_key,
      status: row.status,
      tokenVersion: row.token_version,
      userIdChangedAt: row.user_id_changed_at,
      userIdChangeCount: row.user_id_change_count,
    };

    req.session = {
      id: row.session_id,
      deviceName: row.device_name,
      platform: row.platform,
    };

    req.tokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
}
