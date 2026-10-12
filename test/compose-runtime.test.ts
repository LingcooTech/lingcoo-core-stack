import { composeRuntimeFixture } from './fixtures/compose-runtime';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { composeInstallJobSchema, composeExecutionEvidenceSchema } from '@lingcoo/contracts';
import { validateApplicationDefinition } from '../src/modules/app/definition';
import {
  composeInstallJob,
  prepareComposeConfiguration,
} from '../src/modules/deployment/compose-binding';

test('generated configuration is private, declared and cannot be overridden; legacy definition digests stay stable', () => {
  const { plan, values, definition } = composeRuntimeFixture(
    'docker.io/library/busybox@sha256:' + 'a'.repeat(64),
  );
  assert.match(String(values.PASSWORD), /^[a-f0-9]{64}$/);
  composeInstallJobSchema.parse(composeInstallJob(plan, values, 25371));
  assert.notEqual(prepareComposeConfiguration(plan, {}).PASSWORD, values.PASSWORD);
  assert.throws(() => prepareComposeConfiguration(plan, { PASSWORD: 'override' }), /overridden/);
  assert.ok(!JSON.stringify(plan).includes(String(values.PASSWORD)));
  if (definition.delivery.kind !== 'compose') throw Error('fixture');
  definition.delivery.generatedSecrets![0]!.key = 'UNDECLARED';
  assert.throws(() => validateApplicationDefinition(definition), /preset secret/);
  definition.delivery.generatedSecrets![0]!.key = 'PASSWORD';
  definition.delivery.lifecycle.infrastructure = ['missing'];
  assert.throws(() => validateApplicationDefinition(definition), /unknown service/);
  definition.delivery.lifecycle.infrastructure = ['storage', 'storage'];
  assert.throws(() => validateApplicationDefinition(definition), /Duplicate/);
  definition.delivery.lifecycle.infrastructure = ['storage'];
  const services = (
    definition.delivery.compose as { services: Record<string, Record<string, unknown>> }
  ).services;
  const healthcheck = services.storage!.healthcheck;
  delete services.storage!.healthcheck;
  assert.throws(() => validateApplicationDefinition(definition), /enabled healthcheck/);
  services.storage!.healthcheck = healthcheck;
  services.storage!.depends_on = ['web'];
  assert.throws(() => validateApplicationDefinition(definition), /other infrastructure/);
  delete services.storage!.depends_on;
  definition.delivery.lifecycle.migrate[0]!.service = 'storage';
  assert.throws(() => validateApplicationDefinition(definition), /stopped application service/);
  delete plan.lifecycle.infrastructure;
  assert.throws(() => composeInstallJob(plan, values, 25371), /explicit infrastructure/);
  const legacy = validateApplicationDefinition(
    JSON.parse(readFileSync('examples/stack-compose-app.json', 'utf8')),
  );
  assert.ok(!JSON.stringify(legacy).includes('generatedSecrets'));
  if (legacy.delivery.kind !== 'compose') throw Error('fixture');
  delete legacy.delivery.lifecycle.infrastructure;
  assert.ok(!JSON.stringify(validateApplicationDefinition(legacy)).includes('infrastructure'));
});

test('runner refuses unsafe jobs and symlink workspaces without exposing secrets or touching targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'compose-rejection-'));
  const { job } = composeRuntimeFixture('docker.io/library/busybox@sha256:' + 'a'.repeat(64));
  try {
    const invalid = structuredClone(job);
    (invalid.compose.services as Record<string, Record<string, unknown>>).web!.privileged = true;
    const rejected = spawnSync(
      'python3',
      ['scripts/compose-install.py', '--workspace', join(root, 'never')],
      { input: JSON.stringify(invalid), encoding: 'utf8' },
    );
    assert.equal(rejected.status, 1);
    assert.deepEqual(readdirSync(root), []);
    assert.ok(!rejected.stderr.includes('PASSWORD'));
    symlinkSync(root, join(root, 'link'));
    const symlink = spawnSync(
      'python3',
      ['scripts/compose-install.py', '--workspace', join(root, 'link')],
      { input: JSON.stringify(job), encoding: 'utf8' },
    );
    assert.equal(symlink.status, 1);
    assert.deepEqual(readdirSync(root), ['link']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const docker = spawnSync('docker', ['info'], { timeout: 15000, stdio: 'ignore' }).status === 0;
test(
  'generic Docker installation waits for infrastructure, resumes failed initialization and preserves literal secrets and volumes',
  { skip: !docker, timeout: 240000 },
  () => {
    execFileSync('docker', ['pull', 'busybox:1.37.0'], { timeout: 120000, stdio: 'pipe' });
    const digest = JSON.parse(
      execFileSync(
        'docker',
        ['image', 'inspect', '-f', '{{json .RepoDigests}}', 'busybox:1.37.0'],
        { encoding: 'utf8' },
      ),
    )[0] as string;
    const image = digest.startsWith('busybox@') ? 'docker.io/library/' + digest : digest;
    const { job, values } = composeRuntimeFixture(image);
    const root = mkdtempSync(join(tmpdir(), 'compose-runtime-'));
    const invoke = (input = job) =>
      spawnSync('python3', ['scripts/compose-install.py', '--workspace', root], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 90000,
      });
    try {
      const first = invoke();
      assert.equal(first.status, 1, first.stdout);
      const journal = join(root, job.instanceId, 'installation.json');
      const failed = JSON.parse(readFileSync(journal, 'utf8'));
      assert.equal(failed.failedPhase, 'initialize');
      assert.deepEqual(failed.completed, ['migrate:0']);
      assert.ok(!readFileSync(journal, 'utf8').includes(String(values.PASSWORD)));
      const second = invoke();
      assert.equal(second.status, 0, second.stderr);
      assert.equal(JSON.parse(second.stdout).phase, 'runtime_ready');
      const cid = execFileSync(
        'docker',
        [
          'ps',
          '-q',
          '--filter',
          'label=com.docker.compose.project=' + job.project,
          '--filter',
          'label=com.docker.compose.service=web',
        ],
        { encoding: 'utf8' },
      ).trim();
      const read = (file: string) =>
        execFileSync('docker', ['exec', cid, 'cat', file], { encoding: 'utf8' });
      assert.equal(read('/data/events'), 'migrate\ninitialize\n');
      assert.equal(read('/data/password'), values.PASSWORD);
      assert.equal(read('/data/literal'), 'literal$DOLLAR');
      const before = execFileSync('docker', ['inspect', '-f', '{{.State.StartedAt}}', cid], {
        encoding: 'utf8',
      });
      assert.equal(invoke().status, 0);
      assert.equal(
        execFileSync('docker', ['inspect', '-f', '{{.State.StartedAt}}', cid], {
          encoding: 'utf8',
        }),
        before,
      );
      const changed = structuredClone(job);
      changed.releaseDigest = 'sha256:' + 'c'.repeat(64);
      assert.equal(invoke(changed).status, 1);
      assert.equal(read('/data/events'), 'migrate\ninitialize\n');
      assert.deepEqual(readdirSync(join(root, job.instanceId)), ['installation.json']);
      const transport = {
        id: randomUUID(),
        deploymentId: job.instanceId,
        appCode: 'generic_runtime_fixture',
        hostname: 'fixture.app.example.test',
        resources: job.resources,
        env: {},
        installation: job,
      };
      const config = {
        composeRunnerSha256: createHash('sha256')
          .update(readFileSync('scripts/compose-install.py'))
          .digest('hex'),
      };
      const hosted = (task = transport, settings = config) =>
        spawnSync(
          'python3',
          [
            '-c',
            'import sys,json; from pathlib import Path; sys.path.insert(0,"scripts"); from hosting_compose import execute,ingress_descriptor; data=json.load(sys.stdin); result=execute(data["job"],data["config"],Path(data["workspace"])); ingress_descriptor(Path(data["workspace"])/data["job"]["deploymentId"],data["job"]["deploymentId"]); print(json.dumps(result))',
          ],
          {
            input: JSON.stringify({ job: task, config: settings, workspace: root }),
            encoding: 'utf8',
            timeout: 90000,
          },
        );
      assert.notEqual(hosted(transport, { composeRunnerSha256: '0'.repeat(64) }).status, 0);
      const routed = hosted();
      assert.equal(routed.status, 0, routed.stderr);
      const evidence = composeExecutionEvidenceSchema.parse(
        JSON.parse(routed.stdout).composeEvidence,
      );
      assert.equal(evidence.releaseDigest, job.releaseDigest);
      assert.equal(hosted().status, 0);
      assert.notEqual(hosted({ ...transport, id: randomUUID() }).status, 0);
      assert.ok(
        !readFileSync(join(root, job.instanceId, 'execution.json'), 'utf8').includes(
          String(values.PASSWORD),
        ),
      );
      assert.equal(
        execFileSync('docker', ['inspect', '-f', '{{.State.StartedAt}}', cid], {
          encoding: 'utf8',
        }),
        before,
      );
    } finally {
      spawnSync('docker', ['compose', '-p', job.project, '-f', '-', 'down', '--volumes'], {
        input: JSON.stringify(job.compose),
        timeout: 60000,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      spawnSync('docker', ['network', 'rm', job.project + '-ingress'], {
        stdio: 'ignore',
        timeout: 30000,
      });
      rmSync(root, { recursive: true, force: true });
    }
  },
);
