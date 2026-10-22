import { usersService } from './service.js';

export const usersController = {
  async checkAvailability(req, res, next) {
    try {
      const result = await usersService.checkAvailability(req.query.u);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async updateUserId(req, res, next) {
    try {
      const ip = req.body.ipAddress || req.body.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || '127.0.0.1';
      const result = await usersService.updateUserId(req.user.id, {
        userId: req.body.userId,
        ip,
        deviceName: req.session?.deviceName || 'Device',
        platform: req.session?.platform || 'web',
        sessionId: req.session?.id || null,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const result = await usersService.updateProfile(req.user.id, req.body);
      res.status(200).json({ message: 'Profile updated successfully.', ...result });
    } catch (err) {
      next(err);
    }
  },

  async updatePhoto(req, res, next) {
    try {
      const result = await usersService.updatePhoto(req.user.id, req.body.photoUrl || req.body.photoKey);
      res.status(200).json({ message: 'Profile photo updated successfully.', ...result });
    } catch (err) {
      next(err);
    }
  },

  async deletePhoto(req, res, next) {
    try {
      const result = await usersService.deletePhoto(req.user.id);
      res.status(200).json({ message: 'Profile photo deleted successfully.', ...result });
    } catch (err) {
      next(err);
    }
  },

  async getProfile(req, res, next) {
    try {
      const result = await usersService.getProfile(req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async deleteAccount(req, res, next) {
    try {
      const result = await usersService.deleteAccount(req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
