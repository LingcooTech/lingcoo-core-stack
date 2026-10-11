import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import { applicationDefinitionSchema, type ApplicationDefinition } from '@lingcoo/contracts';
import { httpError } from '../../lib/errors';
import { validateComposeModel } from './compose-validation';

export function parseApplicationDocument(text: string): unknown {
  if (Buffer.byteLength(text) > 512000) throw httpError(422, 'Application document exceeds 500 KB');
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw httpError(422, 'Invalid JSON/YAML document');
  try {
    return document.toJS({ maxAliasCount: 0 }) as unknown;
  } catch {
    throw httpError(422, 'YAML aliases are not supported');
  }
}
export function definitionDigest(value: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, stable(x)]),
          )
        : v;
  return (
    'sha256:' +
    createHash('sha256')
      .update(JSON.stringify(stable(value)))
      .digest('hex')
  );
}
export function validateApplicationDefinition(input: unknown): ApplicationDefinition {
  const definition = applicationDefinitionSchema.parse(input);
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) throw httpError(422, `Duplicate ${label}`);
  };
  unique(
    definition.features.map((v) => v.code),
    'feature',
  );
  unique(
    definition.images.map((v) => v.key),
    'image key',
  );
  unique(
    definition.images.map((v) => v.imageEnv),
    'image environment key',
  );
  if (definition.delivery.kind === 'none') {
    if (definition.images.length)
      throw httpError(422, 'No-deployment applications cannot declare runtime images');
    return definition;
  }
  const delivery = definition.delivery;
  const fields = [...delivery.envFields, ...delivery.secretFields];
  unique(
    [
      ...fields.map((v) => v.key),
      ...delivery.domainSlots.map((v) => v.envKey),
      ...definition.images.map((v) => v.imageEnv),
    ],
    'configuration key',
  );
  unique(
    delivery.domainSlots.map((v) => v.key),
    'domain slot',
  );
  if (typeof delivery.compose === 'string')
    throw httpError(
      422,
      'Compose file must be resolved before validation; upload an embedded Compose document',
    );
  const compose = delivery.compose;
  for (const key of Object.keys(compose))
    if (!['services', 'volumes', 'networks'].includes(key))
      throw httpError(422, `Unsupported Compose root ${key}`);
  const services = compose.services;
  if (
    !services ||
    typeof services !== 'object' ||
    Array.isArray(services) ||
    !Object.keys(services).length
  )
    throw httpError(422, 'Compose services required');
  const serviceMap = services as Record<string, unknown>;
  validateComposeModel(compose);
  if (delivery.resources.serviceWeights) {
    const weights = delivery.resources.serviceWeights;
    if (
      Object.keys(weights).length !== Object.keys(serviceMap).length ||
      Object.keys(serviceMap).some((v) => weights[v] === undefined)
    )
      throw httpError(422, 'Resource weights must include every service exactly once');
  }
  if (!serviceMap[delivery.entrypoint.service])
    throw httpError(422, 'Entrypoint references unknown service');
  const imageVariables = new Set(definition.images.map((v) => v.imageEnv));
  const declared = new Set([
    ...fields.map((v) => v.key),
    ...delivery.domainSlots.map((v) => v.envKey),
    ...imageVariables,
  ]);
  const usedImages = new Set<string>();
  const checkVariables = (v: unknown): void => {
    if (typeof v === 'string') {
      const expanded = v.replaceAll('$$', '');
      for (const match of expanded.matchAll(/\$\{([^}]*)\}/g))
        if (!/^[A-Z][A-Z0-9_]*$/.test(match[1]!) || !declared.has(match[1]!))
          throw httpError(422, `Undeclared Compose variable ${match[1]}`);
      if (expanded.replace(/\$\{[A-Z][A-Z0-9_]*\}/g, '').includes('$') || v.includes('\0'))
        throw httpError(422, 'Compose variables require ${VARIABLE}; literal dollars require $$');
    } else if (Array.isArray(v)) v.forEach(checkVariables);
    else if (v && typeof v === 'object') Object.values(v).forEach(checkVariables);
  };
  for (const [name, raw] of Object.entries(serviceMap)) {
    if (!/^[A-Za-z0-9_-]+$/.test(name) || !raw || typeof raw !== 'object' || Array.isArray(raw))
      throw httpError(422, 'Invalid Compose service');
    const service = raw as Record<string, unknown>;
    for (const key of Object.keys(service))
      if (
        ![
          'image',
          'command',
          'entrypoint',
          'environment',
          'depends_on',
          'volumes',
          'networks',
          'healthcheck',
          'restart',
          'working_dir',
          'user',
          'read_only',
          'tmpfs',
          'stop_grace_period',
          'expose',
          'init',
          'mem_limit',
          'cpus',
          'logging',
        ].includes(key)
      )
        throw httpError(422, `Unsupported Compose service setting ${name}.${key}`);
    if (typeof service.image !== 'string')
      throw httpError(422, `Service ${name} requires an image`);
    const variable = service.image.match(/^\$\{([A-Z][A-Z0-9_]*)\}$/)?.[1];
    if (variable) {
      if (!imageVariables.has(variable)) throw httpError(422, `Undeclared image ${variable}`);
      usedImages.add(variable);
    } else if (!/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(service.image))
      throw httpError(422, `Service ${name} requires a fixed image digest or image variable`);
    if (service.volumes !== undefined) {
      if (!Array.isArray(service.volumes)) throw httpError(422, 'Compose volumes must be an array');
      for (const volume of service.volumes) {
        if (typeof volume !== 'string' || !/^[A-Za-z0-9_-]+:\/[^:]+(?::(?:ro|rw))?$/.test(volume))
          throw httpError(422, 'Only isolated named volumes are supported');
        const volumeName = volume.split(':')[0]!;
        if (
          !compose.volumes ||
          typeof compose.volumes !== 'object' ||
          !(volumeName in compose.volumes)
        )
          throw httpError(422, `Undeclared volume ${volumeName}`);
      }
    }
    checkVariables(service);
  }
  for (const variable of imageVariables)
    if (!usedImages.has(variable)) throw httpError(422, `Unused image ${variable}`);
  for (const section of ['volumes', 'networks'] as const) {
    const values = compose[section];
    if (values !== undefined) {
      if (!values || typeof values !== 'object' || Array.isArray(values))
        throw httpError(422, `Invalid Compose ${section}`);
      for (const [name, value] of Object.entries(values))
        if (
          !/^[A-Za-z0-9_-]+$/.test(name) ||
          (value !== null &&
            (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length))
        )
          throw httpError(422, `Compose ${section} must use project-scoped defaults`);
    }
  }
  for (const step of [
    ...delivery.lifecycle.initialize,
    ...delivery.lifecycle.migrate,
    ...delivery.lifecycle.backup,
    ...delivery.lifecycle.restore,
  ])
    if (!serviceMap[step.service])
      throw httpError(422, 'Lifecycle step references unknown service');
  if (
    Object.keys((compose.volumes ?? {}) as object).length &&
    (!delivery.lifecycle.backup.length || !delivery.lifecycle.restore.length)
  )
    throw httpError(422, 'Persistent applications must declare backup and restore steps');
  if (!definition.images.length)
    throw httpError(422, 'Compose applications require at least one application image');
  return definition;
}
