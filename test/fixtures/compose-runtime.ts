import { randomUUID } from 'node:crypto';
import { applicationReleaseSchema } from '@lingcoo/contracts';
import { compileComposePlan } from '../../src/modules/app/compose-plan';
import { definitionDigest, validateApplicationDefinition } from '../../src/modules/app/definition';
import {
  composeInstallJob,
  prepareComposeConfiguration,
} from '../../src/modules/deployment/compose-binding';

export function composeRuntimeFixture(
  image: string,
  port = 25371,
  httpCommand = ['busybox', 'httpd', '-f', '-p', '8080', '-h', '/data'],
) {
  const definition = validateApplicationDefinition({
    schemaVersion: 1,
    app: {
      code: 'generic_runtime_fixture',
      name: 'Runtime fixture',
      license: 'MIT',
      acquisition: 'free',
    },
    images: [{ key: 'app', imageEnv: 'APP_IMAGE', repository: image.split('@')[0] }],
    delivery: {
      kind: 'compose',
      modes: ['self_hosted', 'managed'],
      domainSlots: [],
      envFields: [],
      secretFields: [
        {
          key: 'PASSWORD',
          label: 'Generated',
          type: 'secret',
          scope: 'preset',
          required: true,
          editable: false,
          advanced: true,
        },
      ],
      generatedSecrets: [{ key: 'PASSWORD', encoding: 'hex', bytes: 32 }],
      resources: { cpuMillis: 500, memoryMb: 256, diskMb: 256 },
      entrypoint: { service: 'web', port: 8080, healthPath: '/health' },
      compose: {
        services: {
          storage: {
            image: '${APP_IMAGE}',
            entrypoint: ['sh', '-c'],
            command: ['touch /data/storage-ready; sleep 86400'],
            volumes: ['data:/data'],
            healthcheck: {
              test: ['CMD', 'test', '-f', '/data/storage-ready'],
              interval: '1s',
              timeout: '1s',
              retries: 10,
            },
          },
          web: {
            image: '${APP_IMAGE}',
            entrypoint: [httpCommand[0]],
            command: httpCommand.slice(1),
            environment: { PASSWORD: '${PASSWORD}', LITERAL: 'literal$$DOLLAR' },
            volumes: ['data:/data'],
            healthcheck: {
              test: ['CMD', 'wget', '-q', '-O', '-', 'http://127.0.0.1:8080/health'],
              interval: '1s',
              timeout: '1s',
              retries: 10,
            },
          },
        },
        volumes: { data: {} },
      },
      lifecycle: {
        infrastructure: ['storage'],
        upgradePolicy: 'same_schema',
        migrate: [
          {
            service: 'web',
            command: ['sh', '-c', 'test -f /data/storage-ready && echo migrate >> /data/events'],
          },
        ],
        initialize: [
          {
            service: 'web',
            command: [
              'sh',
              '-c',
              'if [ ! -f /data/retry ]; then touch /data/retry; exit 1; fi; echo initialize >> /data/events; printf "%s" "$PASSWORD" > /data/password; printf "%s" "$LITERAL" > /data/literal; echo ready > /data/health',
            ],
          },
        ],
        backup: [{ service: 'web', command: ['tar', '-C', '/data', '-cf', '-', '.'] }],
        restore: [{ service: 'web', command: ['tar', '-C', '/data', '-xf', '-'] }],
      },
    },
  });
  const release = applicationReleaseSchema.parse({
    id: randomUUID(),
    version: 'test-1',
    commit: 'b'.repeat(40),
    status: 'draft',
    definition,
    definitionDigest: definitionDigest(definition),
    images: { app: image },
    notes: '',
    buildUrl: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  });
  const plan = compileComposePlan(release, { instanceId: randomUUID(), mode: 'managed' });
  const values = prepareComposeConfiguration(plan, {});
  return { job: composeInstallJob(plan, values, port), plan, values, definition };
}
