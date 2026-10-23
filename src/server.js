import { createApp } from './app.js';
import { env } from './config/env.js';
import { db } from './config/db.js';
import { redis } from './config/redis.js';
import { runMigrations } from './db/migrate.js';

async function bootstrap() {
  // Connect to MongoDB
  await db.connect();

  // Automatically ensure database collections and indexes exist
  try {
    await runMigrations();
  } catch (err) {
    console.warn('⚠️  [ChatLeaf] Database index check warning:', err.message);
  }

  const app = await createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`🍃 ChatLeaf Backend running on http://localhost:${env.PORT} in ${env.NODE_ENV} mode`);
  });

  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    server.close(async () => {
      try {
        await db.close();
        await redis.quit();
        console.log('MongoDB and Redis connections closed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
