import { verifyAccessToken } from '../utils/crypto.js';
import { redis } from '../config/redis.js';
import { User, Session } from '../models/index.js';
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
      const message = 'Your session has been revoked. Please sign in again.';
      return next(AppError.sessionRevoked(revokedReason, message));
    }

    // Check database session and user
    const session = await Session.findOne({ _id: payload.sessionId, userUuid: payload.sub }).lean();
    if (!session) {
      return next(AppError.sessionRevoked('SESSION_REVOKED', 'Session no longer exists.'));
    }

    const user = await User.findById(payload.sub).lean();
    if (!user) {
      return next(AppError.sessionRevoked('SESSION_REVOKED', 'Session no longer exists.'));
    }

    // Check user status
    if (user.status !== 'ACTIVE') {
      return next(AppError.forbidden(`Account status is ${user.status}`, 'ACCOUNT_INACTIVE'));
    }

    // Check token version
    if (typeof payload.tokenVersion === 'number' && user.tokenVersion !== payload.tokenVersion) {
      return next(AppError.sessionRevoked('SESSION_REVOKED', 'Your session has expired. Please sign in again.'));
    }

    // Throttled update of lastActiveAt (fire-and-forget)
    Session.updateOne({ _id: session._id }, { lastActiveAt: new Date() }).catch(() => {});

    req.user = {
      id: user._id.toString(),
      userId: user.userId,
      email: user.email,
      name: user.name || user.fullName || '',
      about: user.about,
      photoUrl: user.photoKey || null,
      status: user.status,
      tokenVersion: user.tokenVersion,
      userIdChangedAt: user.userIdChangedAt,
      userIdChangeCount: user.userIdChangeCount,
    };

    req.session = {
      id: session._id.toString(),
      deviceName: session.deviceName,
      platform: session.platform,
    };

    req.tokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
}
