import { db } from '../config/db.js';
import { redis } from '../config/redis.js';
import { User, Session, UserIdHistory, LoginEvent, EmailOutbox } from '../models/index.js';

async function inspect() {
  console.log('\n======================================================');
  console.log('🍃 CHATLEAF DATABASE (MONGODB ATLAS) & CACHE REPORT');
  console.log('======================================================\n');

  if (db.mongoose.connection.readyState !== 1) {
    await db.connect();
  }

  // 1. Collections in MongoDB
  const cols = await db.mongoose.connection.db.listCollections().toArray();
  console.log('📋 All Existing Collections in MongoDB (' + cols.length + ' collections):', cols.map(c => c.name));
  console.log('\n📊 Permanent Collections Summary:');

  const modelsList = [
    { name: 'users', model: User },
    { name: 'sessions', model: Session },
    { name: 'user_id_history', model: UserIdHistory },
    { name: 'login_events', model: LoginEvent },
    { name: 'email_outbox', model: EmailOutbox },
  ];

  const summary = [];
  for (const item of modelsList) {
    const count = await item.model.countDocuments();
    summary.push({ 'MongoDB Collection (Permanent)': item.name, 'Total Documents': count });
  }
  console.table(summary);

  // 2. Sample Users
  const users = await User.find().sort({ createdAt: -1 }).limit(5).lean();
  console.log('\n👤 [2] Registered Users (Permanent in MongoDB):');
  if (users.length === 0) {
    console.log('   (No users found)');
  } else {
    console.table(users.map(u => ({
      id: u._id,
      userId: u.userId,
      name: u.name || u.fullName,
      email: u.email,
      status: u.status,
      createdAt: u.createdAt,
    })));
  }

  // 3. Sample Sessions
  const sessions = await Session.find().sort({ createdAt: -1 }).limit(5).lean();
  console.log('\n📱 [3] Active Linked Device Sessions (Permanent in MongoDB):');
  if (sessions.length === 0) {
    console.log('   (No active sessions found)');
  } else {
    console.table(sessions.map(s => ({
      id: s._id,
      userUuid: s.userUuid,
      deviceName: s.deviceName,
      platform: s.platform,
      ip: s.ip,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
    })));
  }

  // 4. Redis Keys
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
