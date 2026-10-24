import { Router } from 'express';
import { authController } from './controller.js';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import { sendOtpLimiter, verifyOtpLimiter } from '../../middlewares/rateLimit.js';
import {
  sendOtpSchema,
  resendOtpSchema,
  verifySignupSchema,
  refreshSchema,
  sendLoginOtpSchema,
  verifyLoginOtpSchema,
  googleAuthSchema,
} from './schema.js';

const router = Router();

router.post('/signup/send-otp', sendOtpLimiter, validate(sendOtpSchema), authController.sendSignupOtp);
router.post('/signup/resend-otp', sendOtpLimiter, validate(resendOtpSchema), authController.resendSignupOtp);
router.post('/signup/verify', verifyOtpLimiter, validate(verifySignupSchema), authController.verifySignup);

router.post('/login/send-otp', sendOtpLimiter, validate(sendLoginOtpSchema), authController.sendLoginOtp);
router.post('/login/resend-otp', sendOtpLimiter, validate(sendLoginOtpSchema), authController.resendLoginOtp);
router.post('/login/verify-otp', verifyOtpLimiter, validate(verifyLoginOtpSchema), authController.verifyLoginOtp);
router.post('/google', validate(googleAuthSchema), authController.googleAuth);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/logout', requireAuth, authController.logout);

export { router as authRoutes };
