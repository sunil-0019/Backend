import { usersRouter, meRouter } from './routes.js';

export function register({ app }) {
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/me', meRouter);
}
