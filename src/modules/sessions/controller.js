import { sessionsService } from './service.js';

export const sessionsController = {
  async listSessions(req, res, next) {
    try {
      const result = await sessionsService.listSessions(req.user.id, req.session.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async sendRemoveOtp(req, res, next) {
    try {
      const targetSessionId = req.params.id;
      const result = await sessionsService.sendRemoveDeviceOtp(
        req.user.id,
        targetSessionId,
        req.user.email,
        req.session.id
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async getRemoveStatus(req, res, next) {
    try {
      const targetSessionId = req.params.id;
      const result = await sessionsService.getRemoveDeviceStatus(
        req.user.id,
        targetSessionId,
        req.session.id
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async confirmRemove(req, res, next) {
    try {
      const targetSessionId = req.params.id;
      const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
      const result = await sessionsService.confirmRemoveDevice(
        req.user.id,
        targetSessionId,
        req.body.otp,
        req.user.email,
        req.user.name,
        { ip },
        req.session.id
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async getLoginHistory(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : null;
      const result = await sessionsService.getLoginHistory(req.user.id, { limit, cursor });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
