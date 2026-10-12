import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const image = process.argv[2];
if (!image || image.startsWith('-')) throw Error('Usage: npm run test:image -- <built-image>');
const container = 'stack-dev-smoke-' + randomUUID();
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 60000 }).trim();
try {
  docker(
    'run',
    '--detach',
    '--name',
    container,
    '--read-only',
    '--memory',
    '256m',
    '--cpus',
    '0.5',
    '--security-opt',
    'no-new-privileges:true',
    '--publish',
    '127.0.0.1::8080',
    image,
  );
  const port = docker('port', container, '8080/tcp').split(':').at(-1);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).status === 'ok') {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the process to bind. */
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!ready) throw Error('Image health check failed');
  if (!(await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) })).ok)
    throw Error('Image entry check failed');
  console.info('Image startup and entry verified; platform delivery acceptance is still required.');
} finally {
  docker('rm', '--force', container);
}
