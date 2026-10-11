import { z } from 'zod';
import { applicationReleaseSchema, type ApplicationDefinition } from '@lingcoo/contracts';
import { definitionDigest, validateApplicationDefinition } from './definition';
import { httpError } from '../../lib/errors';

type Release = z.infer<typeof applicationReleaseSchema>;
type ComposeDelivery = Extract<ApplicationDefinition['delivery'], { kind: 'compose' }>;
export type ComposePlan = ReturnType<typeof compileComposePlan>;

/** A version-bound plan contains configuration declarations, never instance secret values. */
export function compileComposePlan(
  releaseInput: Release,
  input: { instanceId: string; mode: 'self_hosted' | 'managed' },
) {
  const release = applicationReleaseSchema.parse(releaseInput),
    definition = validateApplicationDefinition(release.definition);
  z.uuid().parse(input.instanceId);
  if (definitionDigest(definition) !== release.definitionDigest)
    throw httpError(422, 'Release definition digest mismatch');
  if (definition.delivery.kind !== 'compose') throw httpError(422, 'Compose delivery required');
  const delivery = definition.delivery;
  if (!delivery.modes.includes(input.mode)) throw httpError(422, 'Deployment mode not supported');
  if (Object.keys(release.images).length !== definition.images.length)
    throw httpError(422, 'Release image set mismatch');
  for (const image of definition.images)
    if (!release.images[image.key]?.startsWith(image.repository + '@sha256:'))
      throw httpError(422, 'Release image repository mismatch');
  const compose = structuredClone(delivery.compose) as Record<string, unknown>,
    services = compose.services as Record<string, Record<string, unknown>>,
    names = Object.keys(services).sort(),
    weights =
      delivery.resources.serviceWeights ?? Object.fromEntries(names.map((name) => [name, 1]));
  if (
    Object.keys(weights).length !== names.length ||
    names.some(
      (name) => !Number.isInteger(weights[name]) || weights[name]! < 1 || weights[name]! > 1000,
    )
  )
    throw httpError(422, 'Resource weights must include every service exactly once');
  const allocate = (total: number, minimum: number) => {
    if (total < minimum * names.length)
      throw httpError(422, 'Resource budget is too small for the declared services');
    const remaining = total - minimum * names.length,
      sum = names.reduce((value, name) => value + weights[name]!, 0),
      shares = names.map((name) => ({ name, exact: (remaining * weights[name]!) / sum })),
      values = Object.fromEntries(shares.map((v) => [v.name, minimum + Math.floor(v.exact)]));
    let extra = total - Object.values(values).reduce((a, b) => a + b, 0);
    for (const share of shares.sort(
      (a, b) => (b.exact % 1) - (a.exact % 1) || a.name.localeCompare(b.name),
    ))
      if (extra-- > 0) values[share.name]!++;
    return values;
  };
  const cpu = allocate(delivery.resources.cpuMillis, 10),
    memory = allocate(delivery.resources.memoryMb, 64),
    images = Object.fromEntries(definition.images.map((v) => [v.imageEnv, release.images[v.key]!]));
  for (const name of names) {
    const service = services[name]!;
    const variable = (service.image as string).match(/^\$\{([A-Z][A-Z0-9_]*)\}$/)?.[1];
    if (variable) service.image = images[variable];
    // Source limits cannot bypass the platform's aggregate instance budget.
    service.mem_limit = memory[name]! * 1024 * 1024;
    service.memswap_limit = service.mem_limit;
    service.cpus = cpu[name]! / 1000;
    service.pids_limit = 256;
    service.security_opt = ['no-new-privileges:true'];
    service.logging = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } };
  }
  return {
    protocol: 'compose_v1' as const,
    appCode: definition.app.code,
    releaseId: release.id,
    version: release.version,
    commit: release.commit,
    definitionDigest: release.definitionDigest,
    releaseDigest: definitionDigest({
      definitionDigest: release.definitionDigest,
      commit: release.commit,
      version: release.version,
      images: release.images,
    }),
    instanceId: input.instanceId,
    project: 'stack-' + input.instanceId.toLowerCase().replaceAll('-', ''),
    mode: input.mode,
    imageVariables: images,
    resources: delivery.resources,
    services: names.map((name) => ({
      name,
      image: services[name]!.image as string,
      cpuMillis: cpu[name]!,
      memoryMb: memory[name]!,
    })),
    compose,
    fields: {
      env: delivery.envFields,
      secrets: delivery.secretFields,
      domains: delivery.domainSlots,
    },
    entrypoint: delivery.entrypoint,
    lifecycle: delivery.lifecycle,
    volumes: Object.keys((compose.volumes ?? {}) as object).sort(),
  };
}

/** Materialization is separate from preview: callers must store its result as private data. */
export function materializeComposePlan(
  plan: ComposePlan,
  configuration: Record<string, string | boolean>,
  loopbackPort: number,
) {
  z.number().int().min(1024).max(65535).parse(loopbackPort);
  const values: Record<string, string> = { ...plan.imageVariables },
    fields = [...plan.fields.env, ...plan.fields.secrets],
    allowed = new Set([...fields.map((v) => v.key), ...plan.fields.domains.map((v) => v.envKey)]);
  for (const key of Object.keys(configuration))
    if (!allowed.has(key)) throw httpError(422, `Undeclared instance configuration ${key}`);
  for (const field of fields) {
    const value = configuration[field.key] ?? field.defaultValue;
    if (value === undefined || value === '') {
      if (field.required) throw httpError(422, `Required configuration ${field.key}`);
      values[field.key] = '';
      continue;
    }
    if (field.type === 'boolean' && ![true, false, 'true', 'false'].includes(value))
      throw httpError(422, `Invalid boolean configuration ${field.key}`);
    if (field.type === 'email' && !z.email().safeParse(value).success)
      throw httpError(422, `Invalid email configuration ${field.key}`);
    if (field.type !== 'boolean' && typeof value !== 'string')
      throw httpError(422, `Invalid text configuration ${field.key}`);
    values[field.key] = String(value);
  }
  for (const domain of plan.fields.domains) {
    const value = configuration[domain.envKey];
    if (!value && !domain.required) {
      values[domain.envKey] = '';
      continue;
    }
    if (
      typeof value !== 'string' ||
      value.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)
    )
      throw httpError(422, `Invalid domain configuration ${domain.envKey}`);
    values[domain.envKey] = value;
  }
  if (Object.values(values).some((v) => v.length > 8192 || v.includes('\0')))
    throw httpError(422, 'Instance configuration exceeds limits');
  const render = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const result = value.replace(/\$\$|\$\{([^}]*)\}/g, (match, key: string | undefined) => {
        if (match === '$$') return '$';
        if (!key || !/^[A-Z][A-Z0-9_]*$/.test(key) || !(key in values))
          throw httpError(422, 'Compose interpolation requires a declared configuration key');
        return values[key]!;
      });
      if (result.includes('\0')) throw httpError(422, 'NUL in Compose configuration');
      // Compose will perform its own interpolation once; keep all resulting dollars literal.
      return result.replaceAll('$', () => '$$');
    }
    if (Array.isArray(value)) return value.map(render);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item)]));
    return value;
  };
  const compose = render(plan.compose) as Record<string, unknown>,
    services = compose.services as Record<string, Record<string, unknown>>;
  services[plan.entrypoint.service]!.ports = [
    {
      target: plan.entrypoint.port,
      published: loopbackPort,
      host_ip: '127.0.0.1',
      protocol: 'tcp',
    },
  ];
  return {
    project: plan.project,
    compose,
    lifecycle: plan.lifecycle,
    healthUrl: `http://127.0.0.1:${loopbackPort}${plan.entrypoint.healthPath}`,
  };
}

export type { ComposeDelivery };
