import { authService } from './service.js';

export const authController = {
  async sendSignupOtp(req, res, next) {
    try {
      const result = await authService.sendSignupOtp(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async resendSignupOtp(req, res, next) {
    try {
      const result = await authService.resendSignupOtp(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async verifySignup(req, res, next) {
    try {
      const ip = req.body.ipAddress || req.body.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const result = await authService.verifySignup({
        ...req.body,
        ip,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async login(req, res, next) {
    try {
      const ip = req.body.ipAddress || req.body.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const result = await authService.login({
        ...req.body,
        ip,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async refresh(req, res, next) {
    try {
      const result = await authService.refresh(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async logout(req, res, next) {
    try {
      const result = await authService.logout(req.session.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async sendLoginOtp(req, res, next) {
    try {
      const result = await authService.sendLoginOtp(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async verifyLoginOtp(req, res, next) {
    try {
      const ip = req.body.ipAddress || req.body.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const result = await authService.verifyLoginOtp({
        ...req.body,
        ip,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async resendLoginOtp(req, res, next) {
    try {
      const result = await authService.resendLoginOtp(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
