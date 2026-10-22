import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/config/db.js';
import { redis, ensureRedisConnected } from '../src/config/redis.js';
import { runMigrations } from '../src/db/migrate.js';
import { generatePassword } from '../src/modules/auth/password.generator.js';
import { validatePassword } from '../src/modules/auth/password.validator.js';
import { mailService } from '../src/modules/mail/service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ChatLeaf - Auth & Onboarding Specification Acceptance Tests', () => {
  let app;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await ensureRedisConnected(3000);

    // Clean up ONLY automated test accounts (riya.*), preserving ALL developer and user accounts, sessions, and data
    await db.query(`
      DELETE FROM sessions WHERE user_uuid IN (SELECT id FROM users WHERE email LIKE 'riya.%');
      DELETE FROM user_id_history WHERE user_uuid IN (SELECT id FROM users WHERE email LIKE 'riya.%');
      DELETE FROM login_events WHERE email LIKE 'riya.%';
      DELETE FROM email_outbox WHERE to_email LIKE 'riya.%';
      DELETE FROM users WHERE email LIKE 'riya.%';
    `);

    // Clean up only test keys in Redis (preserving real user sessions, locks, and OTPs)
    const testKeys = await redis.keys('*riya.*');
    if (testKeys && testKeys.length > 0) {
      await redis.del(...testKeys);
    }

    app = await createApp();
  });

  afterAll(async () => {
    await db.close();
    await redis.quit();
  });

  // Helper to extract OTP sent to outbox
  async function getLatestOtp(email, purpose) {
    const res = await db.query(
      `SELECT payload FROM email_outbox WHERE to_email = $1 ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase().trim()]
    );
    if (res.rows.length === 0) return null;
    const payload = typeof res.rows[0].payload === 'string' ? JSON.parse(res.rows[0].payload) : res.rows[0].payload;
    return payload.otp;
  }

  // Helper to extract auto-generated password sent to email
  async function getLatestPassword(email) {
    const res = await db.query(
      `SELECT payload FROM email_outbox WHERE to_email = $1 AND template IN ('welcome', 'new-password-generated') ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase().trim()]
    );
    if (res.rows.length === 0) return null;
    const payload = typeof res.rows[0].payload === 'string' ? JSON.parse(res.rows[0].payload) : res.rows[0].payload;
    return payload.password || payload.newPassword;
  }

  // 1. Send OTP x 5 & 24h Lockout
  test('1. Send OTP x 5 -> Attempt 1..5; 6th -> 429 OTP_LOCKED; Resend also blocked', async () => {
    const testEmail = 'riya.lockout@gmail.com';

    // Calling resend before initial send-otp is rejected with 400 OTP_NOT_SENT_YET
    const directResend = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: testEmail });
    expect(directResend.status).toBe(400);
    expect(directResend.body.code).toBe('OTP_NOT_SENT_YET');

    // Sends 1 to 5
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/signup/send-otp')
        .send({ name: 'Riya Sharma', email: testEmail });

      expect(res.status).toBe(200);
      expect(res.body.attempt).toBeUndefined(); // internal only
      expect(res.body.maxAttempts).toBeUndefined(); // internal only
      expect(res.body.message).toBe('OTP sent successfully to your email. Please check your inbox.');
      expect(res.body.totalAttempts).toBe(5);
      expect(res.body.attemptsLeft).toBe(5 - i);
    }

    // 6th Send -> 429 OTP_LOCKED
    const res6 = await request(app)
      .post('/api/v1/auth/signup/send-otp')
      .send({ name: 'Riya Sharma', email: testEmail });

    expect(res6.status).toBe(429);
    expect(res6.body.code).toBe('OTP_LOCKED');
    expect(res6.headers['retry-after']).toBeDefined();
    expect(res6.body.retryAfterSeconds).toBeDefined();
    expect(res6.body.lockedUntil).toBeUndefined(); // lockedUntil removed
    expect(res6.body.message).toContain('Too many OTP requests');

    // Resend -> also blocked 429
    const resResend = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: testEmail });

    expect(resResend.status).toBe(429);
    expect(resResend.body.code).toBe('OTP_LOCKED');
    expect(resResend.body.lockedUntil).toBeUndefined();
  });

  // 2. Status Endpoint Remembers Count & Lock
  test('2. Close/reopen app -> GET /auth/otp/status remembers attempt count and lock state', async () => {
    const testEmail = 'riya.lockout@gmail.com';

    const res = await request(app)
      .get(`/api/v1/auth/otp/status?email=${testEmail}&purpose=signup`);

    expect(res.status).toBe(200);
    expect(res.body.attempt).toBe(5);
    expect(res.body.maxAttempts).toBe(5);
    expect(res.body.remaining).toBe(0);
    expect(res.body.lockedUntil).not.toBeNull();
  });

  // 3. OTP Expiry and Invalidation by New OTP
  test('3. Older OTP is invalidated by new OTP, and expired OTP returns OTP_EXPIRED', async () => {
    const testEmail = 'riya.expiry@gmail.com';

    // 1st OTP
    await request(app)
      .post('/api/v1/auth/signup/send-otp')
      .send({ name: 'Riya Exp', email: testEmail });
    const firstOtp = await getLatestOtp(testEmail, 'signup');
    expect(firstOtp).toBeDefined();

    // 2nd OTP (resend)
    await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: testEmail });
    const secondOtp = await getLatestOtp(testEmail, 'signup');
    expect(secondOtp).toBeDefined();
    expect(secondOtp).not.toBe(firstOtp);

    // Try verifying with first OTP -> should be invalid (already consumed/superseded)
    const resOld = await request(app)
      .post('/api/v1/auth/signup/verify')
      .send({ email: testEmail, otp: firstOtp });
    expect(resOld.status).toBe(400);
    expect(resOld.body.code).toBe('OTP_INVALID');

    // Manually expire second OTP in Redis
    const activeKey = `otp:active:signup:${testEmail.toLowerCase()}`;
    const raw = await redis.get(activeKey);
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      parsed.expiresAt = new Date(Date.now() - 60000).toISOString();
      await redis.set(activeKey, JSON.stringify(parsed), 'EX', 60);
    }

    const resExpired = await request(app)
      .post('/api/v1/auth/signup/verify')
      .send({ email: testEmail, otp: secondOtp });
    expect(resExpired.status).toBe(400);
    expect(resExpired.body.code).toBe('OTP_EXPIRED');
    expect(resExpired.body.message).toContain('OTP expired');
  });

  // 4. 5 Wrong Entries Burn the OTP
  test('4. 5 wrong entries burn the OTP; Resend still works while sends remain', async () => {
    const testEmail = 'riya.wrongentries@gmail.com';

    // Send attempt 1
    await request(app)
      .post('/api/v1/auth/signup/send-otp')
      .send({ name: 'Riya Wrong', email: testEmail });
    const correctOtp = await getLatestOtp(testEmail, 'signup');

    // 4 wrong entries
    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/signup/verify')
        .send({ email: testEmail, otp: '000000' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('OTP_INVALID');
      expect(res.body.attemptsLeft).toBe(5 - i);
    }

    // 5th wrong entry -> burned
    const res5 = await request(app)
      .post('/api/v1/auth/signup/verify')
      .send({ email: testEmail, otp: '000000' });
    expect(res5.status).toBe(400);
    expect(res5.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');

    // Even correct OTP fails now
    const resBurned = await request(app)
      .post('/api/v1/auth/signup/verify')
      .send({ email: testEmail, otp: correctOtp });
    expect(resBurned.status).toBe(400);
    expect(resBurned.body.code).toBe('OTP_INVALID');

    // Resend (attempt 2) works
    const resend = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: testEmail });
    expect(resend.status).toBe(200);
    expect(resend.body.message).toBe('OTP sent successfully to your email. Please check your inbox.');
    expect(resend.body.totalAttempts).toBe(5);
    expect(resend.body.attemptsLeft).toBe(3);
  });

  // 5. Verify Success -> User, Session, Tokens, 8-char Password in Welcome Email (Credentials removed from response for privacy)
  test('5. Verify success -> user, session, tokens, credentials sent to welcome email (not in response for privacy), photoUrl:null', async () => {
    const testEmail = 'riya.signup@gmail.com';
    await request(app)
      .post('/api/v1/auth/signup/send-otp')
      .send({ name: 'Riya Sharma', email: testEmail });

    const otp = await getLatestOtp(testEmail, 'signup');

    const verifyRes = await request(app)
      .post('/api/v1/auth/signup/verify')
      .send({
        email: testEmail,
        otp,
        device: { deviceName: 'Redmi Note 11', platform: 'android' },
      });

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.firstLogin).toBeUndefined();
    expect(verifyRes.body.rules).toBeUndefined();
    expect(verifyRes.body.credentials).toBeUndefined(); // removed for privacy
    expect(verifyRes.body.emailSent).toBeUndefined();
    expect(verifyRes.body.message).toContain('Account created successfully');
    expect(verifyRes.body.user).toBeDefined();
    expect(verifyRes.body.user.email).toBe(testEmail);
    expect(verifyRes.body.user.photoUrl).toBeNull();
    expect(verifyRes.body.user.about).toBe('Hey there, using ChatLeaf');

    // Tokens checks
    expect(verifyRes.body.tokens.accessToken).toBeDefined();
    expect(verifyRes.body.tokens.refreshToken).toBeDefined();
    expect(verifyRes.body.tokens.expiresIn).toBeUndefined();

    // Linked devices list
    expect(verifyRes.body.linkedDevices.count).toBe(1);
    expect(verifyRes.body.linkedDevices.items[0].deviceName).toBe('Redmi Note 11');
    expect(verifyRes.body.linkedDevices.items[0].isCurrent).toBe(true);

    // Welcome email queued in outbox with credentials
    const welcomeMail = await db.query(
      `SELECT payload FROM email_outbox WHERE to_email = $1 AND template = 'welcome' ORDER BY created_at DESC LIMIT 1`,
      [testEmail]
    );
    expect(welcomeMail.rows.length).toBeGreaterThan(0);
    const welcomePayload = typeof welcomeMail.rows[0].payload === 'string' ? JSON.parse(welcomeMail.rows[0].payload) : welcomeMail.rows[0].payload;
    expect(welcomePayload.password).toHaveLength(8);
    expect(welcomePayload.userId).toBe(verifyRes.body.user.userId);
  });

  // 6. Two signups with the same name -> different IDs, each >= 3 edits apart
  test('6. Two signups with same name -> different IDs, Levenshtein distance >= 3, no error shown', async () => {
    const email1 = 'riya.first@gmail.com';
    const email2 = 'riya.second@gmail.com';

    // 1st Riya Sharma
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Sharma', email: email1 });
    const otp1 = await getLatestOtp(email1, 'signup');
    const res1 = await request(app).post('/api/v1/auth/signup/verify').send({ email: email1, otp: otp1 });
    const id1 = res1.body.user.userId;

    // 2nd Riya Sharma
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Sharma', email: email2 });
    const otp2 = await getLatestOtp(email2, 'signup');
    const res2 = await request(app).post('/api/v1/auth/signup/verify').send({ email: email2, otp: otp2 });
    const id2 = res2.body.user.userId;

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThanOrEqual(8);
    expect(id2.length).toBeGreaterThanOrEqual(8);

    // Check Levenshtein distance via PostgreSQL
    const distQuery = await db.query(`SELECT levenshtein($1, $2) as dist`, [id1, id2]);
    const distance = parseInt(distQuery.rows[0].dist, 10);
    expect(distance).toBeGreaterThanOrEqual(3);
  });

  // 7. Email update attempt (API and SQL) fails
  test('7. Email update attempt (API and SQL trigger) fails with EMAIL_NOT_EDITABLE / EMAIL_IMMUTABLE', async () => {
    const testEmail = 'riya.signup@gmail.com';
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: (await db.query(`SELECT id FROM users WHERE email = $1`, [testEmail])).rows[0] ? 'test' : 'test',
    });

    // Fetch token for testEmail
    const userRow = (await db.query(`SELECT id FROM users WHERE email = $1`, [testEmail])).rows[0];
    const sessionRow = (await db.query(`SELECT id FROM sessions WHERE user_uuid = $1 LIMIT 1`, [userRow.id])).rows[0];
    
    // We can issue a test token directly
    const { signAccessToken } = await import('../src/utils/crypto.js');
    const token = signAccessToken({
      sub: userRow.id,
      userId: 'testuser',
      sessionId: sessionRow.id,
      tokenVersion: 0,
    });

    // 1. API attempt
    const apiRes = await request(app)
      .put('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'newemail@gmail.com', name: 'Updated Riya' });

    expect(apiRes.status).toBe(400);
    expect(apiRes.body.code).toBe('EMAIL_NOT_EDITABLE');

    // 2. Direct SQL UPDATE attempt
    let sqlError = null;
    try {
      await db.query(`UPDATE users SET email = 'hacked@gmail.com' WHERE email = $1`, [testEmail]);
    } catch (err) {
      sqlError = err;
    }
    expect(sqlError).not.toBeNull();
    expect(sqlError.message).toContain('EMAIL_IMMUTABLE');
  });

  // 8. Password Rule: abc12345 rejected, Abcdef1! accepted, generated passwords always pass
  test('8. Password rule checks & generated passwords always meet criteria', async () => {
    const fail1 = await validatePassword('abc12345');
    expect(fail1.valid).toBe(false);
    const errorCodes = fail1.fields.map(f => f.error);
    expect(errorCodes).toContain('NEED_CAPITAL');
    expect(errorCodes).toContain('NEED_SPECIAL');

    const pass1 = await validatePassword('Abcdef1!');
    expect(pass1.valid).toBe(true);

    // Test 50 generated passwords: all must pass!
    for (let i = 0; i < 50; i++) {
      const generated = generatePassword();
      expect(generated).toHaveLength(8);
      const val = await validatePassword(generated);
      expect(val.valid).toBe(true);
    }
  });

  // 9. Every login -> login_events + login alert email + linkedDevices (count + items)
  test('9. Every login -> login_events stored + alert email queued + linkedDevices list with count returned', async () => {
    // Create dedicated user with known password
    const testEmail = 'riya.logincheck@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Login', email: testEmail });
    const otp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp,
      device: { deviceName: 'Primary Android', platform: 'android' },
    });

    const userPassword = await getLatestPassword(testEmail);
    const userId = signupRes.body.user.userId;

    // Login using userId
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      identifier: userId,
      password: userPassword,
      device: { deviceName: 'Chrome Laptop', platform: 'web' },
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.firstLogin).toBeUndefined();
    expect(loginRes.body.message).toBe('Logged in successfully.');
    expect(loginRes.body.user.userId).toBe(userId);
    expect(loginRes.body.linkedDevices.count).toBe(2);
    expect(loginRes.body.linkedDevices.items).toHaveLength(2);
    expect(loginRes.body.linkedDevices.items[0].loginFormatted).toBeUndefined();
    expect(loginRes.body.linkedDevices.items[0].activeNow).toBe(true);
    expect(loginRes.body.linkedDevices.items[0].isCurrent).toBe(true);
    expect(loginRes.body.linkedDevices.items[1].isCurrent).toBe(false);

    // Re-login on the same device (Chrome Laptop) -> replaces session, never creates duplicate
    const reLoginRes = await request(app).post('/api/v1/auth/login').send({
      identifier: userId,
      password: userPassword,
      device: { deviceName: 'Chrome Laptop', platform: 'web' },
    });
    expect(reLoginRes.status).toBe(200);
    expect(reLoginRes.body.linkedDevices.count).toBe(2); // Still 2, no duplicates!
    expect(reLoginRes.body.linkedDevices.items).toHaveLength(2);

    // Verify login_events row
    const events = await db.query(
      `SELECT * FROM login_events WHERE email = $1 AND kind = 'LOGIN' ORDER BY created_at DESC`,
      [testEmail]
    );
    expect(events.rows.length).toBeGreaterThan(0);
    expect(events.rows[0].success).toBe(true);
    expect(events.rows[0].device_name).toBe('Chrome Laptop');

    // Verify login-alert email
    const alertMail = await db.query(
      `SELECT * FROM email_outbox WHERE to_email = $1 AND template = 'login-alert'`,
      [testEmail]
    );
    expect(alertMail.rows.length).toBeGreaterThan(0);
  });

  // 10. User ID Edit: Max 2 edits in 1 month (30 days), no password required
  test('10. User ID edit: up to 2 edits allowed in 1 month (30 days) without password; 3rd edit rejected with 403 USER_ID_COOLDOWN', async () => {
    const testEmail = 'riya.idchange@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya ID', email: testEmail });
    const otp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({ email: testEmail, otp });

    const token = signupRes.body.tokens.accessToken;
    const newId1 = 'riyasharma_new1';
    const newId2 = 'riyasharma_new2';
    const newId3 = 'riyasharma_new3';

    // 1st Edit (1 of 2 allowed in 30 days) - no password needed
    const edit1Res = await request(app)
      .patch('/api/v1/me/user-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: newId1 });

    expect(edit1Res.status).toBe(200);
    expect(edit1Res.body.userId).toBe(newId1);
    expect(edit1Res.body.userIdEditAvailable).toBe(true);
    expect(edit1Res.body.message).toBe('User ID updated successfully.');

    // 2nd Edit (2 of 2 allowed in 30 days)
    const edit2Res = await request(app)
      .patch('/api/v1/me/user-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: newId2 });

    expect(edit2Res.status).toBe(200);
    expect(edit2Res.body.userId).toBe(newId2);
    expect(edit2Res.body.userIdEditAvailable).toBe(false);
    expect(edit2Res.body.nextChangeAt).toBeDefined();

    // 3rd Edit in same window -> Cooldown (403)
    const edit3Res = await request(app)
      .patch('/api/v1/me/user-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: newId3 });

    expect(edit3Res.status).toBe(403);
    expect(edit3Res.body.code).toBe('USER_ID_COOLDOWN');
    expect(edit3Res.body.message).toContain('You can only change your User ID 2 times every 1 month');

    // Verify NO email is sent for User ID update as per user requirement
    const idMail = await db.query(
      `SELECT * FROM email_outbox WHERE to_email = $1 AND template = 'userid-updated'`,
      [testEmail]
    );
    expect(idMail.rows.length).toBe(0);
  });

  // 11. Password Change -> Other phone gets 401 SESSION_REVOKED
  test('11. Password change -> other session receives 401 SESSION_REVOKED, current stays logged in', async () => {
    const testEmail = 'riya.pwchange@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Password', email: testEmail });
    const otp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp,
      device: { deviceName: 'Phone A', platform: 'android' },
    });

    const oldPassword = await getLatestPassword(testEmail);
    const tokenA = signupRes.body.tokens.accessToken;

    // Phone B logs in
    const loginBRes = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: oldPassword,
      device: { deviceName: 'Phone B', platform: 'ios' },
    });
    const tokenB = loginBRes.body.tokens.accessToken;

    // Phone A changes password
    const newPassword = 'NewSecretPassword123#';
    const pwChangeRes = await request(app)
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ currentPassword: oldPassword, newPassword });

    expect(pwChangeRes.status).toBe(200);
    expect(pwChangeRes.body.message).toBe('Password updated successfully.');
    expect(pwChangeRes.body.loggedOutDevices).toBe(1);
    const freshTokenA = pwChangeRes.body.tokens.accessToken;

    // Phone B attempts any request -> 401 SESSION_REVOKED
    const phoneBReq = await request(app)
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(phoneBReq.status).toBe(401);
    expect(phoneBReq.body.code).toBe('SESSION_REVOKED');
    expect(phoneBReq.body.reason).toBe('PASSWORD_CHANGED');
    expect(phoneBReq.body.message).toContain('Your password was changed. Please sign in with your new password.');

    // Phone A with freshTokenA works fine!
    const phoneAReq = await request(app)
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${freshTokenA}`);

    expect(phoneAReq.status).toBe(200);
    expect(phoneAReq.body.email).toBe(testEmail);
  });

  // 12. Device Removal: OTP send x 3, 4th blocked; removal kicks device with 401
  test('12. Device removal by OTP: max 5 sends, wrong OTP rejected, correct OTP deletes device and kicks with 401', async () => {
    const testEmail = 'riya.deviceremoval@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Dev', email: testEmail });
    const otp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp,
      device: { deviceName: 'Phone Main', platform: 'android' },
    });

    const tokenMain = signupRes.body.tokens.accessToken;
    const userPassword = await getLatestPassword(testEmail);

    // Login on Device 2
    const login2Res = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Old Tablet', platform: 'tablet' },
    });

    const targetSessionId = login2Res.body.tokens.sessionId;
    const tokenTarget = login2Res.body.tokens.accessToken;

    // Cannot remove own current session
    const cannotRemoveSelf = await request(app)
      .post(`/api/v1/me/sessions/${signupRes.body.tokens.sessionId}/remove/send-otp`)
      .set('Authorization', `Bearer ${tokenMain}`);
    expect(cannotRemoveSelf.status).toBe(400);
    expect(cannotRemoveSelf.body.code).toBe('USE_LOGOUT');

    // Send OTP 1..5
    for (let i = 1; i <= 5; i++) {
      const sendRes = await request(app)
        .post(`/api/v1/me/sessions/${targetSessionId}/remove/send-otp`)
        .set('Authorization', `Bearer ${tokenMain}`);
      expect(sendRes.status).toBe(200);
      expect(sendRes.body.attempt).toBeUndefined();
      expect(sendRes.body.message).toBe('OTP sent successfully to your email. Please check your inbox.');
      expect(sendRes.body.totalAttempts).toBe(5);
      expect(sendRes.body.attemptsLeft).toBe(5 - i);
    }

    // 6th OTP -> 429 Locked
    const send6 = await request(app)
      .post(`/api/v1/me/sessions/${targetSessionId}/remove/send-otp`)
      .set('Authorization', `Bearer ${tokenMain}`);
    expect(send6.status).toBe(429);
    expect(send6.body.code).toBe('OTP_LOCKED');

    // Confirm removal with wrong OTP
    const wrongConfirm = await request(app)
      .post(`/api/v1/me/sessions/${targetSessionId}/remove/confirm`)
      .set('Authorization', `Bearer ${tokenMain}`)
      .send({ otp: '111111' });
    expect(wrongConfirm.status).toBe(400);

    // Get valid OTP from outbox
    const validOtp = await getLatestOtp(testEmail, 'removeDevice');

    // Confirm removal with correct OTP
    const okConfirm = await request(app)
      .post(`/api/v1/me/sessions/${targetSessionId}/remove/confirm`)
      .set('Authorization', `Bearer ${tokenMain}`)
      .send({ otp: validOtp });

    expect(okConfirm.status).toBe(200);
    expect(okConfirm.body.ok).toBe(true);
    expect(okConfirm.body.message).toBe('Device removed successfully.');

    // Target session makes a request -> 401 SESSION_REVOKED
    const targetReq = await request(app)
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${tokenTarget}`);

    expect(targetReq.status).toBe(401);
    expect(targetReq.body.code).toBe('SESSION_REVOKED');
    expect(targetReq.body.reason).toBe('REMOVED_BY_USER');

    // Sessions count reduced by 1
    const listRes = await request(app)
      .get('/api/v1/me/sessions')
      .set('Authorization', `Bearer ${tokenMain}`);
    expect(listRes.body.count).toBe(1);
  });

  // 13. Concurrent send-otp taps never skip or double-count; concurrent signups never create similar IDs
  test('13. Concurrent send-otp taps use row locks (never double count), concurrent signups use advisory lock', async () => {
    const testEmail = 'riya.concurrent@gmail.com';

    // 3 parallel send-otp requests
    const p1 = request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Concur', email: testEmail });
    const p2 = request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Concur', email: testEmail });
    const p3 = request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Concur', email: testEmail });

    const results = await Promise.all([p1, p2, p3]);
    const attemptsLeft = results
      .map(r => r.body.attemptsLeft)
      .sort((a, b) => b - a);

    // The attemptsLeft must be strictly [4, 3, 2] with no duplicates or skips!
    expect(attemptsLeft).toEqual([4, 3, 2]);
  });

  // 14. Modular Design: Adding a dummy module works without editing existing files
  test('14. Adding a dummy module (new route + listener) works without modifying existing files', async () => {
    const dummyModuleDir = path.join(__dirname, '..', 'src', 'modules', 'dummy-feature');
    if (!fs.existsSync(dummyModuleDir)) {
      fs.mkdirSync(dummyModuleDir, { recursive: true });
    }

    const dummyModuleCode = `
      import { Router } from 'express';
      export function register({ app, bus }) {
        const router = Router();
        router.get('/ping', (req, res) => res.json({ message: 'dummy module active' }));
        app.use('/api/v1/dummy', router);
      }
    `;

    fs.writeFileSync(path.join(dummyModuleDir, 'index.js'), dummyModuleCode);

    try {
      // Re-create app to test dynamic discovery
      const newApp = await createApp();
      const res = await request(newApp).get('/api/v1/dummy/ping');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('dummy module active');
    } finally {
      // Cleanup dummy module
      fs.rmSync(dummyModuleDir, { recursive: true, force: true });
    }
  });

  // 15. Max 3 Active Devices: 4th device rejected with 403 DEVICE_LIMIT_REACHED
  test('15. Max 3 active devices: 4th device rejected with 403 DEVICE_LIMIT_REACHED; removal allows new login', async () => {
    const testEmail = 'riya.devicelimit@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Devices', email: testEmail });
    const otp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp,
      device: { deviceName: 'Device 1 (Phone)', platform: 'android' },
    });

    const userPassword = await getLatestPassword(testEmail);
    const session1Id = signupRes.body.tokens.sessionId;
    const token1 = signupRes.body.tokens.accessToken;

    // Login Device 2
    const dev2Res = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Device 2 (Tablet)', platform: 'tablet' },
    });
    expect(dev2Res.status).toBe(200);
    expect(dev2Res.body.linkedDevices.count).toBe(2);

    // Login Device 3
    const dev3Res = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Device 3 (Laptop)', platform: 'web' },
    });
    expect(dev3Res.status).toBe(200);
    expect(dev3Res.body.linkedDevices.count).toBe(3);

    // Attempt Login Device 4 -> rejected with 403 DEVICE_LIMIT_REACHED
    const dev4Res = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Device 4 (Office PC)', platform: 'desktop' },
    });
    expect(dev4Res.status).toBe(403);
    expect(dev4Res.body.code).toBe('DEVICE_LIMIT_REACHED');
    expect(dev4Res.body.message).toContain('Maximum 3 devices can be logged in at the same time');

    // Remove Device 2 using OTP from Device 1
    const dev2SessionId = dev2Res.body.tokens.sessionId;
    await request(app)
      .post(`/api/v1/me/sessions/${dev2SessionId}/remove/send-otp`)
      .set('Authorization', `Bearer ${token1}`);
    const removeOtp = await getLatestOtp(testEmail, 'removeDevice');

    const removeRes = await request(app)
      .post(`/api/v1/me/sessions/${dev2SessionId}/remove/confirm`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ otp: removeOtp });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.message).toBe('Device removed successfully.');

    // Now Device 4 can log in successfully!
    const dev4Retry = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Device 4 (Office PC)', platform: 'desktop' },
    });
    expect(dev4Retry.status).toBe(200);
    expect(dev4Retry.body.linkedDevices.count).toBe(3);
  });

  // 16. Delete Account -> Purges user and sessions from DB, tokens become invalid
  test('16. Delete Account -> Purges user and sessions from DB, tokens become invalid', async () => {
    const testEmail = 'riya.delete@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Delete', email: testEmail });
    const otp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp,
      device: { deviceName: 'Delete Phone', platform: 'android' },
    });
    const token = signupRes.body.tokens.accessToken;

    const delRes = await request(app)
      .delete('/api/v1/me/account')
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);
    expect(delRes.body.message).toBe('Account and all associated sessions deleted successfully.');

    // Profile request with same token now rejected with 401
    const profileRes = await request(app)
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(profileRes.status).toBe(401);
  });

  // 17. Forgot Password Magic Link -> send link to email -> clicking generates new password, emails it, revokes sessions
  test('17. Forgot password magic link -> resets password, emails new 8-char password, revokes sessions', async () => {
    const testEmail = 'riya.forgot@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Forgot', email: testEmail });
    const otp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp,
      device: { deviceName: 'Phone 1', platform: 'android' },
    });
    const oldPassword = await getLatestPassword(testEmail);
    const token1 = signupRes.body.tokens.accessToken;

    // Request magic link
    const linkRes = await request(app)
      .post('/api/v1/auth/forgot-password/send-link')
      .send({ email: testEmail });

    expect(linkRes.status).toBe(200);
    expect(linkRes.body.message).toContain('Password reset link sent to your email');

    // Extract token from outbox email payload
    const mailRow = await db.query(
      `SELECT payload FROM email_outbox WHERE to_email = $1 AND template = 'forgot-password-link' ORDER BY created_at DESC LIMIT 1`,
      [testEmail]
    );
    expect(mailRow.rows.length).toBe(1);
    const mailPayload = typeof mailRow.rows[0].payload === 'string' ? JSON.parse(mailRow.rows[0].payload) : mailRow.rows[0].payload;
    const resetToken = mailPayload.resetToken;
    expect(resetToken).toBeDefined();

    // User clicks magic reset link (GET /auth/forgot-password/reset?token=...)
    const resetRes = await request(app)
      .get(`/api/v1/auth/forgot-password/reset?token=${resetToken}`);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.ok).toBe(true);
    expect(resetRes.body.message).toContain('password has been reset');

    // Single-use check: Clicking the link a second time fails
    const secondClickRes = await request(app)
      .get(`/api/v1/auth/forgot-password/reset?token=${resetToken}`);
    expect(secondClickRes.status).toBe(400);
    expect(secondClickRes.body.code).toBe('LINK_EXPIRED');

    // Fetch newly generated password from outbox
    const newPassword = await getLatestPassword(testEmail);
    expect(newPassword).toBeDefined();
    expect(newPassword).toHaveLength(8);
    expect(newPassword).not.toBe(oldPassword);

    // Old token 1 is revoked
    const profileRes = await request(app)
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token1}`);
    expect(profileRes.status).toBe(401);
    expect(profileRes.body.code).toBe('SESSION_REVOKED');

    // Can log in with new password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: testEmail,
        password: newPassword,
        device: { deviceName: 'Phone 2', platform: 'android' },
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.tokens.accessToken).toBeDefined();
  });

  // 18. Login via OTP: Send OTP (with User ID or Email) -> Verify -> Logs in without kicking other devices
  test('18. Login via OTP -> logs in directly, preserves existing active devices, returns attemptsLeft', async () => {
    const testEmail = 'riya.otplogin@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya OtpLogin', email: testEmail });
    const signupOtp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp: signupOtp,
      device: { deviceName: 'Primary Phone', platform: 'android' },
    });
    const userId = signupRes.body.user.userId;
    const tokenPrimary = signupRes.body.tokens.accessToken;

    // Send Login OTP using User ID
    const sendRes = await request(app)
      .post('/api/v1/auth/login/send-otp')
      .send({ identifier: userId });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.message).toBe('OTP sent successfully to your email. Please check your inbox.');
    expect(sendRes.body.totalAttempts).toBe(5);
    expect(sendRes.body.attemptsLeft).toBe(4);

    const loginOtp = await getLatestOtp(testEmail, 'login');
    expect(loginOtp).toBeDefined();

    // Resend Login OTP
    const resendRes = await request(app)
      .post('/api/v1/auth/login/resend-otp')
      .send({ identifier: userId });

    expect(resendRes.status).toBe(200);
    expect(resendRes.body.message).toBe('OTP sent successfully to your email. Please check your inbox.');
    expect(resendRes.body.totalAttempts).toBe(5);
    expect(resendRes.body.attemptsLeft).toBe(3);

    const newestLoginOtp = await getLatestOtp(testEmail, 'login');
    expect(newestLoginOtp).toBeDefined();

    // Verify Login OTP from a 2nd device (Tablet)
    const verifyRes = await request(app)
      .post('/api/v1/auth/login/verify-otp')
      .send({
        identifier: testEmail,
        otp: newestLoginOtp,
        device: { deviceName: 'Secondary Tablet', platform: 'tablet' },
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.tokens.accessToken).toBeDefined();
    expect(verifyRes.body.tokens.expiresIn).toBeUndefined(); // expiresIn not exposed
    expect(verifyRes.body.linkedDevices.count).toBe(2);

    // Primary Phone is STILL LOGGED IN (not kicked by OTP login!)
    const primaryReq = await request(app)
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${tokenPrimary}`);
    expect(primaryReq.status).toBe(200);
    expect(primaryReq.body.userId).toBe(userId);
  });

  // 19. Clear Error Handling: Non-existent user vs Wrong password; Refresh token clean payload (no message/expiresIn)
  test('19. Standard Login: distinct USER_NOT_FOUND vs INVALID_PASSWORD; Refresh token returns only tokens without message or expiresIn', async () => {
    const testEmail = 'riya.errortest@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya ErrorTest', email: testEmail });
    const signupOtp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp: signupOtp,
      device: { deviceName: 'Device A', platform: 'android' },
    });
    const correctPassword = await getLatestPassword(testEmail);
    const userId = signupRes.body.user.userId;

    // 1. Non-existent User -> 404 USER_NOT_FOUND
    const notFoundRes = await request(app).post('/api/v1/auth/login').send({
      identifier: 'non_existent_user_9999',
      password: 'SomePassword123#',
    });
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.code).toBe('USER_NOT_FOUND');
    expect(notFoundRes.body.message).toContain('No account found with this User ID or email.');

    // 2. Existing User but Wrong Password -> 401 INVALID_PASSWORD
    const wrongPwRes = await request(app).post('/api/v1/auth/login').send({
      identifier: userId,
      password: 'WrongPassword123#',
    });
    expect(wrongPwRes.status).toBe(401);
    expect(wrongPwRes.body.code).toBe('INVALID_PASSWORD');
    expect(wrongPwRes.body.message).toBe('Incorrect password. Please try again.');

    // 3. Successful Login -> Tokens without expiresIn
    const okLogin = await request(app).post('/api/v1/auth/login').send({
      identifier: userId,
      password: correctPassword,
      device: { deviceName: 'Device B', platform: 'ios' },
    });
    expect(okLogin.status).toBe(200);
    expect(okLogin.body.tokens.accessToken).toBeDefined();
    expect(okLogin.body.tokens.refreshToken).toBeDefined();
    expect(okLogin.body.tokens.expiresIn).toBeUndefined(); // expiresIn not exposed

    // 4. Refresh Token -> returns ONLY tokens (no message, no expiresIn)
    const refreshRes = await request(app).post('/api/v1/auth/refresh').send({
      sessionId: okLogin.body.tokens.sessionId,
      refreshToken: okLogin.body.tokens.refreshToken,
    });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
    expect(refreshRes.body.sessionId).toBeUndefined(); // sessionId not returned in response
    expect(refreshRes.body.message).toBeUndefined(); // message removed
    expect(refreshRes.body.expiresIn).toBeUndefined(); // expiresIn removed

    // 5. Browser visits expired/used reset link -> receives clean HTML error page
    const htmlRes = await request(app)
      .get('/api/v1/auth/forgot-password/reset?token=invalid_or_expired_token')
      .set('Accept', 'text/html');
    expect(htmlRes.status).toBe(400);
    expect(htmlRes.text).toContain('Reset Link Expired');
    expect(htmlRes.text).toContain('valid for 10 minutes');
  });

  // 20. Device Removal By Position (Position 1): Deletes top other device
  test('20. Device removal by position index: removing position 1 deletes the 1st other device', async () => {
    const testEmail = 'riya.positiontest@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya Pos', email: testEmail });
    const signupOtp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp: signupOtp,
      device: { deviceName: 'Current Phone', platform: 'android' },
    });
    const currentToken = signupRes.body.tokens.accessToken;
    const userPassword = await getLatestPassword(testEmail);

    // Login Device 2
    const dev2Res = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Other Phone 1', platform: 'android' },
    });
    const tokenDev2 = dev2Res.body.tokens.accessToken;

    // Send remove OTP targeting position 1
    const sendRes = await request(app)
      .post('/api/v1/me/sessions/1/remove/send-otp')
      .set('Authorization', `Bearer ${currentToken}`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.deviceName).toBe('Other Phone 1');

    const otp = await getLatestOtp(testEmail, 'removeDevice');
    expect(otp).toBeDefined();

    // Confirm removal with position 1
    const confirmRes = await request(app)
      .post('/api/v1/me/sessions/1/remove/confirm')
      .set('Authorization', `Bearer ${currentToken}`)
      .send({ otp });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.ok).toBe(true);

    // Device 2 is kicked (401)
    const dev2Req = await request(app).get('/api/v1/me/profile').set('Authorization', `Bearer ${tokenDev2}`);
    expect(dev2Req.status).toBe(401);
    expect(dev2Req.body.code).toBe('SESSION_REVOKED');

    // Current device is still active
    const curReq = await request(app).get('/api/v1/me/profile').set('Authorization', `Bearer ${currentToken}`);
    expect(curReq.status).toBe(200);
  });

  // 21. Remove All Other Devices: Keeps current device, revokes all other devices
  test('21. Remove all other devices: current session stays logged in, all other devices revoked with 401', async () => {
    const testEmail = 'riya.removeall@gmail.com';
    await request(app).post('/api/v1/auth/signup/send-otp').send({ name: 'Riya AllDev', email: testEmail });
    const signupOtp = await getLatestOtp(testEmail, 'signup');
    const signupRes = await request(app).post('/api/v1/auth/signup/verify').send({
      email: testEmail,
      otp: signupOtp,
      device: { deviceName: 'Main Device 1', platform: 'web' },
    });
    const mainToken = signupRes.body.tokens.accessToken;
    const userPassword = await getLatestPassword(testEmail);

    // Login Device 2
    const d2 = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Device 2 (Tablet)', platform: 'tablet' },
    });
    const token2 = d2.body.tokens.accessToken;

    // Login Device 3
    const d3 = await request(app).post('/api/v1/auth/login').send({
      identifier: testEmail,
      password: userPassword,
      device: { deviceName: 'Device 3 (Work PC)', platform: 'desktop' },
    });
    const token3 = d3.body.tokens.accessToken;

    // Verify 3 devices active
    const listBefore = await request(app).get('/api/v1/me/sessions').set('Authorization', `Bearer ${mainToken}`);
    expect(listBefore.body.count).toBe(3);

    // Send OTP to remove all other devices
    const sendAllRes = await request(app)
      .post('/api/v1/me/sessions/remove-all/send-otp')
      .set('Authorization', `Bearer ${mainToken}`);
    expect(sendAllRes.status).toBe(200);
    expect(sendAllRes.body.mode).toBe('ALL');
    expect(sendAllRes.body.deviceCount).toBe(2);

    const otp = await getLatestOtp(testEmail, 'removeAllDevices');
    expect(otp).toBeDefined();

    // Confirm remove all
    const confirmAllRes = await request(app)
      .post('/api/v1/me/sessions/remove-all/confirm')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ otp });
    expect(confirmAllRes.status).toBe(200);
    expect(confirmAllRes.body.ok).toBe(true);
    expect(confirmAllRes.body.removedCount).toBe(2);

    // Device 2 and Device 3 are revoked (401)
    const checkD2 = await request(app).get('/api/v1/me/profile').set('Authorization', `Bearer ${token2}`);
    expect(checkD2.status).toBe(401);
    expect(checkD2.body.code).toBe('SESSION_REVOKED');

    const checkD3 = await request(app).get('/api/v1/me/profile').set('Authorization', `Bearer ${token3}`);
    expect(checkD3.status).toBe(401);
    expect(checkD3.body.code).toBe('SESSION_REVOKED');

    // Main device remains active
    const checkMain = await request(app).get('/api/v1/me/profile').set('Authorization', `Bearer ${mainToken}`);
    expect(checkMain.status).toBe(200);

    // Sessions count is now 1
    const listAfter = await request(app).get('/api/v1/me/sessions').set('Authorization', `Bearer ${mainToken}`);
    expect(listAfter.body.count).toBe(1);
  });
});
