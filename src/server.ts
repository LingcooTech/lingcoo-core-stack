import { buildApp } from './app';
import { loadEnv, type AppEnv } from './lib/env';
import { withTimeout } from './runtime/lifecycle';

export async function startServer(env: AppEnv, signal: AbortSignal) {
  const app = await buildApp(env);
  let closing: Promise<void> | undefined;
  const close = () => {
    app.isDraining = true;
    closing ??= withTimeout(app.close(), env.API_SHUTDOWN_TIMEOUT_MS);
    void closing.catch(() => {
      process.exitCode = 1;
    });
  };
  signal.addEventListener('abort', close, { once: true });
  app.addHook('onClose', async () => {
    signal.removeEventListener('abort', close);
  });
  try {
    if (signal.aborted) throw new Error('Startup cancelled');
    await app.ready();
    await withTimeout(Promise.all([app.pg.query('select 1'), app.redis.ping()]), 5000);
    await app.listen({ host: '0.0.0.0', port: env.PORT });
    return app;
  } catch (error) {
    await withTimeout(app.close(), 5000).catch(() => {});
    throw error;
  }
}

if (require.main === module) {
  const shutdown = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let app: Awaited<ReturnType<typeof startServer>> | undefined;
  let timeout = 30000;
  const terminate = () => {
    deadline ??= setTimeout(() => process.exit(1), timeout + 5000);
    shutdown.abort();
    if (app)
      void app
        .close()
        .then(() => clearTimeout(deadline))
        .catch(() => {});
  };
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);
  try {
    const env = loadEnv();
    timeout = env.API_SHUTDOWN_TIMEOUT_MS;
    void startServer(env, shutdown.signal)
      .then((result) => {
        app = result;
      })
      .catch(() => {
        console.error('[api] startup failed');
        process.exit(1);
      });
  } catch {
    console.error('[api] invalid runtime configuration');
    process.exitCode = 1;
  }
}
