import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import { db } from './config/db.js';
import { redis, ensureRedisConnected } from './config/redis.js';
import { errorHandler } from './middlewares/error.js';
import { AppError } from './core/errors.js';
import { mountModules } from './modules/index.js';

export async function createApp() {
  await ensureRedisConnected(2000);
  const app = express();

  // Trust upstream proxies (Cloudflare, Render, Railway, Nginx) for accurate client IP detection
  app.set('trust proxy', true);

  // Security middlewares
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(hpp());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Health and Readiness checks
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
  });

  app.get('/ready', async (req, res) => {
    try {
      await db.query('SELECT 1');
      await redis.ping();
      res.status(200).json({ status: 'READY', db: 'UP', redis: 'UP' });
    } catch (err) {
      res.status(503).json({ status: 'UNAVAILABLE', error: err.message });
    }
  });

  // Mount modular feature modules automatically
  await mountModules(app);

  // 404 Route Handler
  app.use((req, res, next) => {
    next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
