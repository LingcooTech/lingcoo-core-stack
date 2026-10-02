import { z } from 'zod';
import { httpError } from '../../lib/errors';
import type { jobRuns } from '../../db/schema';
export const jobPayloadSchemas = {
  'email.deliver': z.object({
    to: z.email(),
    subject: z.string().min(1),
    text: z.string(),
    html: z.string().optional(),
  }),
  'alert.webhook.deliver': z.object({ body: z.record(z.string(), z.unknown()) }),
  'notifications.project': z.object({ eventIds: z.array(z.uuid()).min(1).max(100) }),
  'billing.refund.reconcile': z.object({ orderNo: z.string().min(1) }),
};
export function validateJobPayload(kind: string, payload: unknown) {
  const schema = jobPayloadSchemas[kind as keyof typeof jobPayloadSchemas];
  if (!schema || !schema.safeParse(payload).success) throw httpError(400, 'Invalid job payload');
}
export type JobExecution = Pick<typeof jobRuns.$inferSelect, 'kind' | 'payload' | 'meta'>;
export type JobHandler = (
  payload: Record<string, unknown>,
  context: { signal: AbortSignal },
) => Promise<Record<string, unknown>>;
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();
  register(kind: keyof typeof jobPayloadSchemas, handler: JobHandler) {
    if (this.handlers.has(kind)) throw new Error('Duplicate job handler');
    this.handlers.set(kind, handler);
    return this;
  }
  async run(job: JobExecution, signal: AbortSignal) {
    signal.throwIfAborted();
    const meta = job.meta as Record<string, unknown>;
    if (meta?.payloadVersion !== undefined && meta.payloadVersion !== 1)
      throw httpError(400, 'Unsupported job payload version');
    validateJobPayload(job.kind, job.payload);
    const handler = this.handlers.get(job.kind);
    if (!handler) throw httpError(400, 'Unsupported job kind');
    return handler(job.payload as Record<string, unknown>, { signal });
  }
}
