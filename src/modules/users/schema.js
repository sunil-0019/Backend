import { z } from 'zod';

export const checkUserIdSchema = z.object({
  query: z.object({
    u: z.string().trim().min(1, 'Username / User ID parameter required'),
  }),
});

export const updateUserIdSchema = z.object({
  body: z.object({
    userId: z.string().trim().min(8, 'User ID must be at least 8 characters').max(100, 'User ID cannot exceed 100 characters'),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(50).optional(),
    about: z.string().trim().max(139).optional(),
    email: z.string().optional(),
  }),
});
