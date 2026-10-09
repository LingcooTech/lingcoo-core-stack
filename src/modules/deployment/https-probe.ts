import { request } from 'node:https';
import { isIP } from 'node:net';
import { httpError } from '../../lib/errors';
import { hostingProfileSchema } from '@lingcoo/contracts';
import { eq } from 'drizzle-orm';
import { apps } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
const legacyPaths = ['/', '/admin/', '/health/ready', '/health/worker'];
export function hostedProbePaths(meta: unknown): string[] {
  const raw =
    meta && typeof meta === 'object' ? (meta as Record<string, unknown>).hostingProfile : undefined;
  if (raw === undefined) return legacyPaths;
  const profile = hostingProfileSchema.safeParse(raw);
  if (!profile.success) throw httpError(409, '应用托管健康检查配置无效');
  return profile.data.httpChecks ?? legacyPaths;
}
export async function loadHostedProbePaths(db: DbExecutor, appId: string) {
  const [app] = await db.select({ meta: apps.meta }).from(apps).where(eq(apps.id, appId));
  if (!app) throw httpError(409, '应用不存在');
  return hostedProbePaths(app.meta);
}
/** Pin the verified node IP while validating TLS/SNI for the customer's hostname. */
export async function probeHostedHttps(
  hostname: string,
  ip: string,
  deploymentId: string,
  paths = legacyPaths,
) {
  if (!isIP(ip)) throw httpError(409, '托管节点地址无效');
  for (const path of paths) {
    await new Promise<void>((resolve, reject) => {
      const req = request(
        {
          hostname: ip,
          servername: hostname,
          port: 443,
          path,
          method: 'GET',
          headers: { Host: hostname },
          rejectUnauthorized: true,
        },
        (response) => {
          const valid =
            response.statusCode === 200 &&
            response.headers['x-lingcoo-deployment'] === deploymentId;
          response.destroy();
          if (valid) resolve();
          else reject(httpError(409, '公网 HTTPS 尚未就绪或路由不匹配'));
        },
      );
      const timer = setTimeout(() => req.destroy(new Error('HTTPS verification timed out')), 8000);
      req.on('close', () => clearTimeout(timer));
      req.on('error', reject);
      req.end();
    });
  }
}
