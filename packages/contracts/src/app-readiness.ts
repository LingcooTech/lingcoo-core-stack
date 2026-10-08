import { z } from 'zod';
export const AppReadinessSchema = z.object({
  appCode: z.string(),
  appStatus: z.string(),
  configurationReady: z.boolean(),
  scope: z.literal('configuration'),
  checks: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      status: z.enum(['passed', 'blocked', 'unverified']),
      detail: z.string(),
      blocking: z.boolean(),
    }),
  ),
  checkedAt: z.string(),
});
