import { z } from 'zod';
import { httpError } from '../../lib/errors';

const serviceName = z.string().regex(/^[A-Za-z0-9_-]+$/);
const argv = z.union([z.string().max(10000), z.array(z.string().max(10000)).min(1).max(100)]);
const duration = z.string().regex(/^(?:\d+(?:\.\d+)?(?:ns|us|ms|s|m|h))+$/);
const environment = z.union([
  z.record(
    z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    z.union([z.string(), z.number().finite()]),
  ),
  z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*=/)),
]);
const dependencies = z.union([
  z.array(serviceName),
  z.record(
    serviceName,
    z
      .object({
        condition: z.enum(['service_started', 'service_healthy', 'service_completed_successfully']),
        restart: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
  ),
]);
const healthcheck = z
  .object({
    test: argv.optional(),
    interval: duration.optional(),
    timeout: duration.optional(),
    start_period: duration.optional(),
    start_interval: duration.optional(),
    retries: z.number().int().min(1).max(100).optional(),
    disable: z.boolean().optional(),
  })
  .strict();
const service = z
  .object({
    image: z.string(),
    command: argv.optional(),
    entrypoint: argv.optional(),
    environment: environment.optional(),
    depends_on: dependencies.optional(),
    volumes: z.array(z.string()).optional(),
    networks: z.array(serviceName).optional(),
    healthcheck: healthcheck.optional(),
    restart: z.enum(['no', 'always', 'on-failure', 'unless-stopped']).optional(),
    working_dir: z.string().startsWith('/').optional(),
    user: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)?$/)
      .optional(),
    read_only: z.boolean().optional(),
    tmpfs: z.array(z.string().regex(/^\/[A-Za-z0-9/_.-]+$/)).optional(),
    stop_grace_period: duration.optional(),
    expose: z
      .array(
        z.union([
          z.number().int().min(1).max(65535),
          z.string().regex(/^\d{1,5}(?:\/(?:tcp|udp))?$/),
        ]),
      )
      .optional(),
    init: z.boolean().optional(),
    mem_limit: z
      .union([z.number().int().positive(), z.string().regex(/^\d+(?:[bkmgBKMG])?$/)])
      .optional(),
    cpus: z.number().positive().max(64).optional(),
    logging: z
      .object({
        driver: z.enum(['json-file', 'local', 'none']),
        options: z.record(z.enum(['max-size', 'max-file', 'compress']), z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Nested Compose settings need their own contract; top-level whitelists alone are insufficient. */
export function validateComposeModel(input: Record<string, unknown>) {
  const services = z.record(serviceName, service).parse(input.services),
    networks = new Set(['default', ...Object.keys((input.networks ?? {}) as object)]);
  if (Object.keys(services).length > 30) throw httpError(422, 'Too many Compose services');
  for (const [name, value] of Object.entries(services)) {
    for (const dependency of Array.isArray(value.depends_on)
      ? value.depends_on
      : Object.keys(value.depends_on ?? {}))
      if (dependency === name || !(dependency in services))
        throw httpError(422, 'Invalid Compose dependency');
    for (const network of value.networks ?? [])
      if (!networks.has(network)) throw httpError(422, 'Undeclared Compose network');
    for (const port of value.expose ?? [])
      if (Number(String(port).split('/')[0]) > 65535) throw httpError(422, 'Invalid exposed port');
  }
  const visited = new Set<string>();
  const visit = (name: string, path: Set<string>) => {
    if (path.has(name)) throw httpError(422, 'Cyclic Compose dependency');
    if (visited.has(name)) return;
    const value = services[name]!,
      next = new Set([...path, name]);
    for (const child of Array.isArray(value.depends_on)
      ? value.depends_on
      : Object.keys(value.depends_on ?? {}))
      visit(child, next);
    visited.add(name);
  };
  for (const name of Object.keys(services)) visit(name, new Set());
}
