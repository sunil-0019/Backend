import { db } from '../../../../config/db.js';

export default {
  order: 40,
  name: 'USER_ID_SIMILARITY',
  abortOnFail: true,
  async check(value, ctx = {}) {
    const id = value.toLowerCase().trim();
    const client = ctx.client || db;
    const exceptUserUuid = ctx.exceptUserUuid || null;

    // 1. Exact match check
    const exactUser = await client.query(
      `SELECT 1 FROM users WHERE user_id = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`,
      [id, exceptUserUuid]
    );
    if (exactUser.rows.length > 0) {
      return { valid: false, error: 'USER_ID_TAKEN', message: 'This User ID is already taken' };
    }

    const exactHistory = await client.query(
      `SELECT 1 FROM user_id_history WHERE old_user_id = $1 AND reserved_until > now() AND ($2::uuid IS NULL OR user_uuid <> $2) LIMIT 1`,
      [id, exceptUserUuid]
    );
    if (exactHistory.rows.length > 0) {
      return { valid: false, error: 'USER_ID_TAKEN', message: 'This User ID is reserved' };
    }

    // 2. Similarity check (Levenshtein distance <= 2 means distance < 3 characters)
    // Run similarity with levenshtein_less_equal
    const simQuery = `
      SELECT 1 FROM users u
       WHERE levenshtein_less_equal(u.user_id::text, $1, 2) <= 2
         AND ($2::uuid IS NULL OR u.id <> $2)
      UNION ALL
      SELECT 1 FROM user_id_history h
       WHERE h.reserved_until > now()
         AND levenshtein_less_equal(h.old_user_id::text, $1, 2) <= 2
         AND ($2::uuid IS NULL OR h.user_uuid <> $2)
      LIMIT 1
    `;

    const simResult = await client.query(simQuery, [id, exceptUserUuid]);
    if (simResult.rows.length > 0) {
      return { valid: false, error: 'USER_ID_TOO_SIMILAR', message: 'This User ID is too similar to an existing ID' };
    }

    return { valid: true };
  }
};
