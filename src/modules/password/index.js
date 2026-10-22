import { mePasswordRouter, authPasswordRouter } from './routes.js';

export function register({ app }) {
  app.use('/api/v1/me', mePasswordRouter);
  app.use('/api/v1/auth', authPasswordRouter);
}
