import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const image = process.env.STACK_SMOKE_IMAGE ?? 'lingcoo-stack-foundation:verify';
const project = 'lingcoo-stack-image-smoke';
const env = { ...process.env, STACK_SMOKE_IMAGE: image };
function docker(args, expectSuccess = true) {
  const result = spawnSync('docker', args, { env, encoding: 'utf8', timeout: 180000 });
  if (result.error) throw result.error;
  if (expectSuccess && result.status !== 0)
    throw new Error(
      `Docker smoke failed: ${args.slice(0, 5).join(' ')}\n${result.stdout}\n${result.stderr}`,
    );
  return result;
}
const compose = (args, success = true) =>
  docker(['compose', '-p', project, '-f', 'docker-compose.smoke.yml', ...args], success);
try {
  const inspect = JSON.parse(docker(['image', 'inspect', image]).stdout)[0];
  assert.equal(inspect.Config.User, '1001');
  docker([
    'run',
    '--rm',
    '--read-only',
    '--tmpfs',
    '/tmp',
    image,
    'node',
    '-e',
    `
    const assert=require('node:assert/strict');
    assert.equal(process.versions.node.split('.')[0],'22');
    assert.equal(process.getuid(),1001);
    require('@lingcoo/contracts'); require('pg'); require('drizzle-orm/node-postgres/migrator');
    for(const name of ['typescript','tsx','drizzle-kit','react','vite']) assert.throws(()=>require.resolve(name));
    assert(require('node:fs').existsSync('/app/admin-ui/dist/index.html'));
    assert.throws(()=>require('node:fs').writeFileSync('/app/readonly-probe','fixture'));
  `,
  ]);
  console.info(
    '[image-smoke] Node 22, production dependencies and readonly non-root runtime passed',
  );
  compose(['up', '-d', '--wait', 'postgres', 'redis']);
  for (let i = 0; i < 2; i++)
    compose(['run', '--rm', '--no-deps', 'api', 'node', 'scripts/run-migrations.mjs']);
  console.info('[image-smoke] migrations passed');
  compose(['up', '-d', '--wait', '--wait-timeout', '120', 'api', 'worker']);
  compose([
    'exec',
    '-T',
    'api',
    'node',
    '-e',
    `
    const assert=require('node:assert/strict');
    const {Client}=require('pg'); const {randomUUID}=require('node:crypto');
    (async()=>{const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
      try {
        const id=randomUUID();
        await client.query("insert into job_runs (id,kind,payload,meta,dedupe_key) values ($1,'notifications.project',$2,$3,$4)",[id,{eventIds:[randomUUID()]},{payloadVersion:1},'image-smoke-'+id]);
        let status;
        for(let i=0;i<100;i++){
          status=(await client.query('select status from job_runs where id=$1',[id])).rows[0].status;
          if(status==='succeeded')break;
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.equal(status,'succeeded','Worker must actually claim and execute a job');
      } finally {await client.end();}
    })().catch(()=>{process.exitCode=1;});
  `,
  ]);
  console.info('[image-smoke] API / Worker healthy; job execution passed');
  const base = 'http://127.0.0.1:15440';
  const version = (await (await fetch(base + '/ready')).json()).version;
  assert.equal(version, inspect.Config.Labels['org.opencontainers.image.version']);
  for (const route of ['/admin/login', '/admin/settings', '/account?tab=orders', '/deploy']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(html.includes('type="module"'));
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(
      (match) => match[1],
    );
    assert(assets.length > 0);
    for (const asset of assets) assert.equal((await fetch(base + asset)).status, 200);
  }
  assert.equal((await fetch(base + '/api-docs')).status, 404);
  console.info('[image-smoke] version, deep routes, assets and disabled docs passed');
  const started = Date.now();
  const failed = compose(
    [
      'run',
      '--rm',
      '--no-deps',
      '-e',
      'DATABASE_URL=postgres://fixture:fixture@127.0.0.1:1/unreachable_test',
      'api',
      'node',
      'dist/server.js',
    ],
    false,
  );
  assert.notEqual(failed.status, 0);
  // Includes Docker provisioning and cold Node module loading, not only the 5s dependency probe.
  assert(Date.now() - started < 60000, 'Failed API startup must exit within the container budget');
  const workerStarted = Date.now();
  const workerFailure = compose(
    [
      'run',
      '--rm',
      '--no-deps',
      '-e',
      'REDIS_URL=redis://127.0.0.1:1',
      'worker',
      'node',
      'dist/worker.js',
    ],
    false,
  );
  assert.notEqual(workerFailure.status, 0);
  assert(
    Date.now() - workerStarted < 60000,
    'Failed Worker startup must exit within the container budget',
  );
  console.info('[image-smoke] API / Worker startup failures exited within budget');
  compose(['stop', '-t', '10', 'api', 'worker']);
  for (const service of ['api', 'worker']) {
    const id = compose(['ps', '-aq', service]).stdout.trim();
    const state = JSON.parse(docker(['inspect', id]).stdout)[0].State;
    assert.equal(state.ExitCode, 0, `${service} must handle SIGTERM without SIGKILL`);
  }
  console.info('[image-smoke] API / Worker SIGTERM exited cleanly');
  // Restart the retained image against the migrated schema; no database rollback.
  compose(['up', '-d', '--wait', '--wait-timeout', '120', 'api', 'worker']);
  assert.equal((await (await fetch(base + '/ready')).json()).version, version);
  await delay(200);
  console.log(
    'Verified Node 22 production-only dependencies, readonly non-root runtime, migrations, assets, readiness, failure cleanup, SIGTERM and retained-image restart',
  );
} catch (error) {
  const diagnostic = compose(['logs', '--no-color', '--tail', '30', 'api', 'worker'], false);
  process.stderr.write(diagnostic.stdout);
  throw error;
} finally {
  compose(['down', '--volumes', '--remove-orphans']);
}
