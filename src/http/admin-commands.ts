import { createApiServices, type ApiServices } from '../composition/api-runtime';
import type { AppEnv } from '../lib/env';
import type { ServiceFactories } from '../composition/service-factories';
import type { FastifyRequest } from 'fastify';
import type { DbExecutor } from '../db/types';
import { AuditLogService, auditContext, type AuditLogRecordInput } from '../modules/audit/public';
export function createAdminCommandRunner(
  db: DbExecutor,
  env: AppEnv,
  factories?: ServiceFactories,
) {
  return async function run<T>(
    request: FastifyRequest,
    input: AuditLogRecordInput,
    work: (services: ApiServices) => Promise<T>,
  ): Promise<T> {
    try {
      return await db.transaction(async (tx) => {
        const result = await work(createApiServices(tx, env, factories));
        await new AuditLogService(tx).record({ ...input, ...auditContext(request) });
        return result;
      });
    } catch (error) {
      try {
        await new AuditLogService(db).record({
          ...input,
          ...auditContext(request),
          outcome: 'failed',
          summary: 'Administrative command failed',
          meta: {},
        });
      } catch {
        /* Preserve the original failure. */
      }
      throw error;
    }
  };
}
