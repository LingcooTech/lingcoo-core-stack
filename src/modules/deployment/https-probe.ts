import { request } from 'node:https';
import { isIP } from 'node:net';
import { httpError } from '../../lib/errors';
/** Pin the verified node IP while validating TLS/SNI for the customer's hostname. */
export async function probeHostedHttps(hostname: string, ip: string, deploymentId: string) {
  if (!isIP(ip)) throw httpError(409, '托管节点地址无效');
  for (const path of ['/', '/admin/', '/health/ready', '/health/worker']) {
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
