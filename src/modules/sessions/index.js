import { sessionsRoutes } from './routes.js';

export function register({ app }) {
  app.use('/api/v1/me', sessionsRoutes);
}
