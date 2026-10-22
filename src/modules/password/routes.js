import { Router } from 'express';
import { passwordController } from './controller.js';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import { sendOtpLimiter, verifyOtpLimiter } from '../../middlewares/rateLimit.js';
import {
  changePasswordSchema,
  forgotPasswordSendOtpSchema,
  forgotPasswordVerifySchema,
} from './schema.js';

const mePasswordRouter = Router();
mePasswordRouter.post('/password', requireAuth, validate(changePasswordSchema), passwordController.changePassword);
mePasswordRouter.post('/password/forgot-link', requireAuth, passwordController.sendForgotPasswordLink);

const authPasswordRouter = Router();
authPasswordRouter.post('/forgot-password/send-link', sendOtpLimiter, validate(forgotPasswordSendOtpSchema), passwordController.sendForgotPasswordLink);
authPasswordRouter.get('/forgot-password/reset', passwordController.resetPasswordWithLink);
authPasswordRouter.post('/forgot-password/reset', passwordController.resetPasswordWithLink);
authPasswordRouter.post('/forgot-password/send-otp', sendOtpLimiter, validate(forgotPasswordSendOtpSchema), passwordController.sendForgotPasswordOtp);
authPasswordRouter.post('/forgot-password/verify', verifyOtpLimiter, validate(forgotPasswordVerifySchema), passwordController.resetPasswordWithOtp);

export { mePasswordRouter, authPasswordRouter };
