import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function applicationResponse(path) {
  if (path === '/health') return { status: 200, body: { status: 'ok' } };
  if (path === '/') return { status: 200, body: { message: 'Stack delivery sample' } };
  return { status: 404, body: { error: 'Not found' } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer((request, response) => {
    const result = applicationResponse(new URL(request.url, 'http://localhost').pathname);
    response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(result.body));
  });
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}
