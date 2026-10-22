import { Router } from 'express';
import { otpService } from './service.js';
import { AppError } from '../../core/errors.js';

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    const email = req.query.email;
    const purpose = req.query.purpose || 'signup';

    if (!email) {
      throw AppError.badRequest('Email is required', 'VALIDATION');
    }

    const status = await otpService.getStatus({
      subject: email.trim().toLowerCase(),
      purpose,
    });

    res.status(200).json(status);
  } catch (err) {
    next(err);
  }
});

export { router as otpRoutes };
