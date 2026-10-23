import { db } from '../config/db.js';
import { User, Session, UserIdHistory, LoginEvent, EmailOutbox } from '../models/index.js';

export async function runMigrations() {
  console.log('Verifying MongoDB collections and indexes...');
  if (db.mongoose.connection.readyState !== 1) {
    await db.connect();
  }

  // Ensure indexes for each collection
  await Promise.all([
    User.init(),
    Session.init(),
    UserIdHistory.init(),
    LoginEvent.init(),
    EmailOutbox.init(),
  ]);

  console.log('🍃 MongoDB collections and indexes verified successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await db.close();
      process.exit(1);
    });
}
