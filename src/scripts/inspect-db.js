import { db } from '../config/db.js';
import { redis } from '../config/redis.js';

async function inspect() {
  console.log('\n======================================================');
  console.log('🍃 CHATLEAF DATABASE & CACHE INSPECTION REPORT');
  console.log('======================================================\n');

  // 1. PostgreSQL Schema Tables
  const allTablesRes = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log('📋 All Existing Tables in PostgreSQL (' + allTablesRes.rows.length + ' tables):', allTablesRes.rows.map(r => r.table_name));
  console.log('\n📊 Permanent Tables Summary:');

  const tables = ['users', 'sessions', 'user_id_history', 'login_events', 'email_outbox'];
  const summary = [];

  for (const t of tables) {
    const res = await db.query(`SELECT count(*) FROM ${t}`);
    summary.push({ 'PostgreSQL Table (Permanent)': t, 'Total Rows': Number(res.rows[0].count) });
  }
  console.table(summary);

  // 2. Sample Users
  const usersRes = await db.query(`SELECT id, user_id, name, email, status, created_at FROM users ORDER BY created_at DESC LIMIT 5`);
  console.log('\n👤 [2] Registered Users (Permanent in PostgreSQL):');
  if (usersRes.rows.length === 0) {
    console.log('   (No users found)');
  } else {
    console.table(usersRes.rows);
  }

  // 3. Sample Sessions / Devices
  const sessionsRes = await db.query(`SELECT id, user_uuid, device_name, platform, ip, created_at, last_active_at FROM sessions ORDER BY created_at DESC LIMIT 5`);
  console.log('\n📱 [3] Active Linked Device Sessions (Permanent in PostgreSQL):');
  if (sessionsRes.rows.length === 0) {
    console.log('   (No active sessions found)');
  } else {
    console.table(sessionsRes.rows);
  }

  // 4. Redis Keys (Temporary with TTL)
  await new Promise(r => setTimeout(r, 600));
  const redisKeys = await redis.keys('*');
  console.log(`\n⚡ [4] Redis Cache (Upstash Cloud - Temporary with Auto-TTL) - Total Keys: ${redisKeys.length}:`);
  if (redisKeys.length === 0) {
    console.log('   (No active keys in Redis cache)');
  } else {
    const keyData = [];
    for (const k of redisKeys.slice(0, 15)) {
      const ttl = await redis.ttl(k);
      let desc = 'Temporary Cache';
      if (k.startsWith('otp:active:')) desc = 'Active 10-Min OTP Code (Redis)';
      if (k.startsWith('otp:limit:')) desc = 'OTP 24-Hour Rate Limiter & Lockout (Redis)';
      if (k.startsWith('revoked:sid:')) desc = 'Kicked/Revoked Session Blacklist (Redis)';
      if (k.startsWith('forgot:link:')) desc = '10-Min Password Reset Magic Link (Redis)';
      if (k.startsWith('forgot:count:')) desc = 'Forgot Password 24h Rate Limiter (Redis)';
      keyData.push({ Key: k, 'TTL (Seconds)': ttl, Purpose: desc });
    }
    console.table(keyData);
  }

  console.log('\n✅ Inspection complete.\n');
  await db.close();
  await redis.quit();
  process.exit(0);
}

inspect().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
