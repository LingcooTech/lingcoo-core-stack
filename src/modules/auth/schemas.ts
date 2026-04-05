import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(120).optional()
});

export const loginSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128)
});

export const verifyEmailSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'Verification code must be 6 digits')
});

export const forgotPasswordSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase())
});

export const resetPasswordSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  code: z.string().length(6).regex(/^\d{6}$/, 'Reset code must be 6 digits'),
  newPassword: z.string().min(8).max(128)
});
