import { User, UserIdHistory } from '../../../../models/index.js';
import { levenshtein } from '../../../../utils/levenshtein.js';

export default {
  order: 40,
  name: 'USER_ID_SIMILARITY',
  abortOnFail: true,
  async check(value, ctx = {}) {
    const id = value.toLowerCase().trim();
    const exceptUserUuid = ctx.exceptUserUuid || null;

    // 1. Exact match check in users
    const userFilter = { userId: id };
    if (exceptUserUuid) {
      userFilter._id = { $ne: exceptUserUuid };
    }
    const exactUser = await User.findOne(userFilter).lean();
    if (exactUser) {
      return { valid: false, error: 'USER_ID_TAKEN', message: 'This User ID is already taken' };
    }

    // Exact match check in reserved user_id_history
    const historyFilter = {
      oldUserId: id,
      reservedUntil: { $gt: new Date() },
    };
    if (exceptUserUuid) {
      historyFilter.userUuid = { $ne: exceptUserUuid };
    }
    const exactHistory = await UserIdHistory.findOne(historyFilter).lean();
    if (exactHistory) {
      return { valid: false, error: 'USER_ID_TAKEN', message: 'This User ID is reserved' };
    }

    // 2. Similarity check (Levenshtein distance <= 2 means distance < 3 characters)
    // Check against all existing users
    const users = await User.find(
      exceptUserUuid ? { _id: { $ne: exceptUserUuid } } : {},
      'userId'
    ).lean();

    for (const u of users) {
      if (u.userId && levenshtein(u.userId, id) <= 2) {
        return { valid: false, error: 'USER_ID_TOO_SIMILAR', message: 'This User ID is too similar to an existing ID' };
      }
    }

    // Check against reserved old IDs
    const reservedHistories = await UserIdHistory.find(
      {
        reservedUntil: { $gt: new Date() },
        ...(exceptUserUuid ? { userUuid: { $ne: exceptUserUuid } } : {})
      },
      'oldUserId'
    ).lean();

    for (const h of reservedHistories) {
      if (h.oldUserId && levenshtein(h.oldUserId, id) <= 2) {
        return { valid: false, error: 'USER_ID_TOO_SIMILAR', message: 'This User ID is too similar to an existing ID' };
      }
    }

    return { valid: true };
  }
};
