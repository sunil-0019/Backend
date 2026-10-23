import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  SUPPORT_EMAIL: z.string().email().default('support@chatleaf.com'),
  MAIL_FROM_EMAIL: z.string().email().default('noreply@chatleaf.com'),
  MAIL_FROM_NAME: z.string().default('ChatLeaf'),
  BREVO_API_KEY: z.string().default('mock-key'),
  OTP_HMAC_SECRET: z.string().min(16, 'OTP_HMAC_SECRET must be at least 16 chars'),
  PASSWORD_PEPPER: z.string().optional(),
  JWT_PRIVATE_KEY: z.string().min(1, 'JWT_PRIVATE_KEY is required'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Environment configuration error');
}

export const env = {
  ...parsed.data,
  BREVO_API_KEY: parsed.data.BREVO_API_KEY.replace(/[^\x20-\x7E]/g, '').trim(),
  JWT_PRIVATE_KEY: parsed.data.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
  JWT_PUBLIC_KEY: parsed.data.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
};
