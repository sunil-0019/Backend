import { otpRoutes } from './routes.js';

export function register({ app }) {
  app.use('/api/v1/auth/otp', otpRoutes);
}
