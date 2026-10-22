import { mailService } from './service.js';

export function register({ bus }) {
  // Listen to domain events and dispatch emails asynchronously
  bus.on('user.created', async (data) => {
    try {
      await mailService.send('welcome', { email: data.email, name: data.name }, data);
    } catch (err) {
      console.error('Failed to send welcome email:', err);
    }
  });

  bus.on('user.loggedIn', async (data) => {
    try {
      await mailService.send('login-alert', { email: data.email, name: data.name }, data);
    } catch (err) {
      console.error('Failed to send login-alert email:', err);
    }
  });

  bus.on('user.passwordChanged', async (data) => {
    try {
      await mailService.send('password-updated', { email: data.email, name: data.name }, data);
    } catch (err) {
      console.error('Failed to send password-updated email:', err);
    }
  });

  bus.on('user.idChanged', async (data) => {
    try {
      await mailService.send('userid-updated', { email: data.email, name: data.name }, data);
    } catch (err) {
      console.error('Failed to send userid-updated email:', err);
    }
  });

  bus.on('session.removed', async (data) => {
    try {
      await mailService.send('device-removed', { email: data.email, name: data.name }, data);
    } catch (err) {
      console.error('Failed to send device-removed email:', err);
    }
  });
}
