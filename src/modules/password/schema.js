import { z } from 'zod';

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(1, 'New password is required'),
  }),
});

export const forgotPasswordSendOtpSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
  }),
});

export const forgotPasswordVerifySchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    otp: z.string().trim().min(6).max(6),
    newPassword: z.string().min(1, 'New password is required'),
  }),
});
