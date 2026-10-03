import { z } from 'zod';
import { authResponseSchema, userSchema } from '../core-responses.js';

export const BootstrapStatusSchema = z.object({ hasAdmin: z.boolean() });

export type BootstrapStatus = z.infer<typeof BootstrapStatusSchema>;

export const AuthResponseSchema = authResponseSchema;

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const CurrentUserProfileSchema = userSchema;

export type CurrentUserProfile = z.infer<typeof CurrentUserProfileSchema>;

export const VerifyEmailResponseSchema = z.object({
  verified: z.boolean(),
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.union([z.string(), z.null()]),
    role: z.string(),
    emailVerified: z.boolean(),
  }),
});

export type VerifyEmailResponse = z.infer<typeof VerifyEmailResponseSchema>;

export const ResendVerificationResponseSchema = z.object({
  sent: z.boolean(),
  alreadyVerified: z.boolean().optional(),
});

export type ResendVerificationResponse = z.infer<typeof ResendVerificationResponseSchema>;

export const ForgotPasswordResponseSchema = z.object({ sent: z.boolean() });

export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

export const ResetPasswordResponseSchema = z.object({ reset: z.boolean() });

export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;

export const UpdateCurrentUserResponseSchema = z.object({ user: CurrentUserProfileSchema });

export type UpdateCurrentUserResponse = z.infer<typeof UpdateCurrentUserResponseSchema>;

export const ChangePasswordResponseSchema = z.object({ changed: z.boolean() });

export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;

export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.union([z.string(), z.null()]),
  role: z.string(),
  status: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUsersResponseSchema = z.object({
  items: z.array(AdminUserSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;

export const AdminUpdateUserInputSchema = z.object({
  displayName: z.string().optional(),
  role: z
    .union([
      z.literal('user'),
      z.literal('support'),
      z.literal('finance'),
      z.literal('editor'),
      z.literal('operator'),
      z.literal('admin'),
    ])
    .optional(),
  status: z.union([z.literal('active'), z.literal('suspended')]).optional(),
});

export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserInputSchema>;

export const AdminResetPasswordResultSchema = z.object({
  userId: z.string(),
  email: z.string(),
  temporaryPassword: z.string(),
});

export type AdminResetPasswordResult = z.infer<typeof AdminResetPasswordResultSchema>;
