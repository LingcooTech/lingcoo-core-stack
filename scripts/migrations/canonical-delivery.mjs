/** One-time conversion only. Runtime code must not interpret these retired shapes. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fields from './delivery-v1-fields.json' with { type: 'json' };
const object = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export function canonicalSettings(value) {
  const raw = object(value);
  if (raw.values || raw.secrets || raw.installer)
    return {
      values: object(raw.values),
      secrets: object(raw.secrets),
      installer: object(raw.installer),
    };
  return {
    values: Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => raw[key] !== undefined)
        .map(([key, target]) => [target, raw[key]]),
    ),
    secrets: {
      ...(raw.acrPassword ? { ACR_PASSWORD: raw.acrPassword } : {}),
      ...(raw.githubToken || raw.GITHUB_TOKEN
        ? { GH_TOKEN: raw.githubToken || raw.GITHUB_TOKEN }
        : {}),
    },
    installer: { repoUrl: raw.repoUrl || '', repoBranch: raw.repoBranch || '' },
  };
}
export function canonicalDeployment(meta, manifest = {}) {
  const next = structuredClone(object(meta));
  const previous = object(next.runtimeUpdate);
  const legacy = object(next.wordpressAssetsUpdate);
  const current = {},
    available = {};
  const assetKey = (env, fallback) =>
    manifest.assets?.find((a) => a.imageEnv === env || a.tagEnv === env)?.key || fallback;
  for (const [suffix, env, key] of [
    ['FrontendImage', 'FRONTEND_IMAGE', 'legacy-frontend'],
    ['WebsocketImage', 'WEBSOCKET_IMAGE', 'legacy-websocket'],
  ]) {
    if (previous['current' + suffix]) current[assetKey(env, key)] = previous['current' + suffix];
    if (previous['available' + suffix])
      available[assetKey(env, key)] = previous['available' + suffix];
  }
  for (const [key, value] of Object.entries(object(legacy.current)))
    current[assetKey(key, key)] = value;
  for (const [key, value] of Object.entries({ ...legacy, ...object(legacy.available) }))
    if (key.startsWith('AVAILABLE_')) available[assetKey(key.slice(10), key.slice(10))] = value;
  const assets = object(next.runtimeAssetsUpdate);
  next.runtimeAssetsUpdate = {
    ...(previous.offeredAt ? { offeredAt: previous.offeredAt } : {}),
    ...(previous.appliedAt ? { appliedAt: previous.appliedAt } : {}),
    ...assets,
    current: { ...current, ...object(assets.current) },
    available: { ...available, ...object(assets.available) },
  };
  next.runtimeUpdate = { ...(previous.policy ? { policy: previous.policy } : {}) };
  delete next.wordpressAssetsUpdate;
  // Retired application-specific commands must never be executed after the upgrade.
  for (const key of ['pendingAction', 'lastAction'])
    if (String(next[key]?.kind).includes('wordpress')) delete next[key];
  return next;
}
function cryptoFor(env) {
  const keys = env.SETTINGS_ENCRYPTION_KEYS
    ? JSON.parse(env.SETTINGS_ENCRYPTION_KEYS)
    : { primary: env.SETTINGS_ENCRYPTION_KEY?.trim() || env.JWT_SECRET };
  const keyId = env.SETTINGS_ENCRYPTION_CURRENT_KEY_ID || 'primary';
  if (!keys[keyId]) throw Error('Delivery migration encryption key unavailable');
  const derive = (v) => createHash('sha256').update(v).digest();
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', derive(keys[keyId]), iv);
      const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
      return {
        version: 2,
        keyId,
        alg: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      };
    },
    decrypt(value) {
      if (![1, 2].includes(value?.version) || value.alg !== 'aes-256-gcm')
        throw Error('Invalid delivery envelope');
      const candidates =
        value.version === 2
          ? [keys[value.keyId]]
          : env.ALLOW_LEGACY_SETTINGS_DECRYPTION === 'false'
            ? []
            : [
                env.SETTINGS_ENCRYPTION_LEGACY_KEY,
                env.SETTINGS_ENCRYPTION_KEY,
                env.JWT_SECRET,
                ...Object.values(keys),
              ];
      for (const key of candidates.filter(Boolean))
        try {
          const d = createDecipheriv('aes-256-gcm', derive(key), Buffer.from(value.iv, 'base64'));
          d.setAuthTag(Buffer.from(value.tag, 'base64'));
          return JSON.parse(
            Buffer.concat([d.update(Buffer.from(value.data, 'base64')), d.final()]).toString(),
          );
        } catch {}
      throw Error('Delivery migration decryption failed');
    },
  };
}
export async function migrateCanonicalDelivery(client, env = process.env) {
  if (
    !(
      await client.query(
        "select to_regclass('public.app_delivery_settings') is not null as present",
      )
    ).rows[0].present
  )
    return;
  const marker = 'migration.delivery-canonical-v1';
  if ((await client.query('select 1 from system_settings where key=$1', [marker])).rowCount) return;
  await client.query('begin');
  try {
    const apps = (await client.query('select id,code,meta from apps for update')).rows;
    let crypto;
    const crypt = () => (crypto ??= cryptoFor(env));
    const archive = async (key, value) =>
      client.query(
        'insert into system_settings(key,value,is_encrypted) values($1,$2,true) on conflict(key) do nothing',
        [`migration.delivery-backup.${key}`, JSON.stringify(crypt().encrypt(value))],
      );
    for (const app of apps) {
      const meta = object(app.meta);
      const defaults = object(meta.deploymentDefaults);
      const row = (
        await client.query('select * from app_delivery_settings where app_id=$1 for update', [
          app.id,
        ])
      ).rows[0];
      const old = (
        await client.query('select * from system_settings where key=$1 for update', [
          `deployment.delivery.${app.code}`,
        ])
      ).rows[0];
      const selected = row || old;
      if (selected || Object.keys(defaults).length) {
        const raw = selected
          ? selected.is_encrypted
            ? crypt().decrypt(selected.value)
            : selected.value
          : {};
        const canonical = canonicalSettings(raw);
        const base = canonicalSettings(defaults);
        const value = {
          values: { ...base.values, ...canonical.values },
          secrets: { ...base.secrets, ...canonical.secrets },
          installer: { ...base.installer, ...canonical.installer },
        };
        if (
          !row ||
          JSON.stringify(raw) !== JSON.stringify(value) ||
          Object.keys(defaults).length ||
          old
        ) {
          await archive(app.id, { current: row || null, old: old || null, defaults });
          await client.query(
            'insert into app_delivery_settings(app_id,value,is_encrypted,updated_by_user_id) values($1,$2,true,$3) on conflict(app_id) do update set value=excluded.value,is_encrypted=true,updated_at=now()',
            [app.id, JSON.stringify(crypt().encrypt(value)), selected?.updated_by_user_id || null],
          );
        }
        if (old) await client.query('delete from system_settings where key=$1', [old.key]);
      }
      if (meta.deploymentDefaults !== undefined) {
        delete meta.deploymentDefaults;
        await client.query('update apps set meta=$2 where id=$1', [app.id, JSON.stringify(meta)]);
      }
      const deployments = (
        await client.query(
          "select id,meta from deployments where app_id=$1 and (meta ? 'wordpressAssetsUpdate' or meta->'runtimeUpdate' ?| array['currentFrontendImage','currentWebsocketImage','availableFrontendImage','availableWebsocketImage'] or meta->'pendingAction'->>'kind' like '%wordpress%' or meta->'lastAction'->>'kind' like '%wordpress%') for update",
          [app.id],
        )
      ).rows;
      for (const dep of deployments) {
        await archive(dep.id, dep.meta);
        await client.query('update deployments set meta=$2 where id=$1', [
          dep.id,
          JSON.stringify(canonicalDeployment(dep.meta, object(meta.deliveryManifest))),
        ]);
      }
    }
    await client.query('insert into system_settings(key,value) values($1,$2)', [
      marker,
      JSON.stringify({ completedAt: new Date().toISOString() }),
    ]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
