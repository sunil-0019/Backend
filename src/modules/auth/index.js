import { authRoutes } from './routes.js';

export function register({ app }) {
  app.use('/api/v1/auth', authRoutes);
}
