import { buildApp } from './app';
import { loadEnv } from './lib/env';

async function main() {
  const env = loadEnv();
  const app = await buildApp(env);

  try {
    await app.listen({
      host: '0.0.0.0',
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error, 'failed to start server');
    process.exit(1);
  }
}

void main();
