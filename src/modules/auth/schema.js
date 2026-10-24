import { z } from 'zod';

export const sendOtpSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be at most 50 characters'),
    email: z.string().trim().toLowerCase().email('Invalid email address'),
  }),
});

export const resendOtpSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
  }),
});

export const verifySignupSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    otp: z.string().trim().min(6).max(6),
    device: z.object({
      deviceId: z.string().optional(),
      deviceName: z.string().optional(),
      model: z.string().optional(),
      platform: z.string().optional(),
      appVersion: z.string().optional(),
    }).optional().default({}),
    fcmToken: z.string().optional(),
    ipAddress: z.string().optional(),
    ip: z.string().optional(),
  }),
});


export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
    sessionId: z.string().uuid('Valid session ID required'),
  }),
});

export const sendLoginOtpSchema = z.object({
  body: z.object({
    identifier: z.string().trim().min(1, 'User ID or email is required'),
  }),
});

export const verifyLoginOtpSchema = z.object({
  body: z.object({
    identifier: z.string().trim().min(1, 'User ID or email is required'),
    otp: z.string().trim().min(6).max(6),
    device: z.object({
      deviceId: z.string().optional(),
      deviceName: z.string().optional(),
      model: z.string().optional(),
      platform: z.string().optional(),
      appVersion: z.string().optional(),
    }).optional().default({}),
    fcmToken: z.string().optional(),
    ipAddress: z.string().optional(),
    ip: z.string().optional(),
  }),
});

export const googleAuthSchema = z.object({
  body: z.object({
    idToken: z.string().trim().optional(),
    token: z.string().trim().optional(),
    credential: z.string().trim().optional(),
    email: z.string().trim().toLowerCase().email('Invalid email address').optional(),
    name: z.string().trim().optional(),
    photoUrl: z.string().trim().optional(),
    device: z.object({
      deviceId: z.string().optional(),
      deviceName: z.string().optional(),
      model: z.string().optional(),
      platform: z.string().optional(),
      appVersion: z.string().optional(),
    }).optional().default({}),
    fcmToken: z.string().optional(),
    ipAddress: z.string().optional(),
    ip: z.string().optional(),
  }).refine(data => data.idToken || data.token || data.credential || data.email, {
    message: 'Google idToken (or email) is required',
    path: ['idToken'],
  }),
});
