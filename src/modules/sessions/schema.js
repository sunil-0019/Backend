import { z } from 'zod';

export const removeDeviceConfirmSchema = z.object({
  body: z.object({
    otp: z.string().trim().min(6).max(6),
  }),
});
