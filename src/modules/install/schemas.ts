import { z } from 'zod';

export const installParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  installId: z.uuid(),
});

const installPayloadShape = {
  extensionInstallId: z.string().trim().min(8).max(128).optional(),
  deviceFingerprint: z.string().trim().min(1).max(255).optional(),
  chromeProfileHint: z.string().trim().min(1).max(255).optional(),
  appVersion: z.string().trim().min(1).max(32).optional(),
};

export const createInstallSchema = z.object(installPayloadShape);

export const installHeartbeatSchema = z.object({
  deviceFingerprint: installPayloadShape.deviceFingerprint,
  chromeProfileHint: installPayloadShape.chromeProfileHint,
  appVersion: installPayloadShape.appVersion,
});
