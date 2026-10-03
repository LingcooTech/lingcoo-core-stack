import { z } from 'zod';

const environmentKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const field = z
  .object({
    key: environmentKey,
    label: z.string().min(1),
    type: z.enum(['text', 'email', 'boolean', 'secret']),
    scope: z.enum(['user_input', 'preset']),
    required: z.boolean(),
    editable: z.boolean(),
    advanced: z.boolean(),
    group: z.string().optional(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    defaultValue: z.union([z.string(), z.boolean()]).optional(),
  })
  .strict();

/** Strict publishing contract. Runtime legacy normalization remains compatible. */
export const deliveryManifestSchema = z
  .object({
    version: z.literal('1'),
    installer: z
      .object({
        repoUrl: z.url(),
        repoBranch: z.string().min(1),
        remoteInstallScriptUrl: z.url(),
        installPath: z.string().startsWith('/'),
      })
      .strict(),
    groups: z
      .array(
        z
          .object({
            key: z.string().min(1),
            label: z.string().min(1),
            description: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    domainSlots: z.array(
      z
        .object({
          key: z.string().min(1),
          label: z.string().min(1),
          envKey: environmentKey,
          sourceField: z.string().min(1),
          required: z.boolean(),
          placeholder: z.string().optional(),
          description: z.string().optional(),
        })
        .strict(),
    ),
    envFields: z.array(
      field.refine((value) => value.type !== 'secret', 'Secrets belong in secretFields'),
    ),
    secretFields: z.array(
      field.refine(
        (value) => value.type === 'secret' && value.defaultValue === undefined,
        'Secret fields must have secret type and no embedded default',
      ),
    ),
    assets: z.array(
      z
        .object({
          key: z.string().min(1),
          label: z.string().min(1),
          type: z.enum(['github_release', 'docker_image', 'qiniu_object', 'http_file', 'custom']),
          required: z.boolean(),
          visibility: z.enum(['public', 'private']),
          group: z.string().optional(),
          description: z.string().optional(),
          repo: z.string().optional(),
          file: z.string().optional(),
          path: z.string().optional(),
          tag: z.string().optional(),
          tagEnv: environmentKey.optional(),
          image: z.string().optional(),
          imageEnv: environmentKey.optional(),
          url: z.string().optional(),
          urlEnv: environmentKey.optional(),
          authSecret: environmentKey.optional(),
          checksum: z.string().optional(),
          checksumEnv: environmentKey.optional(),
        })
        .strict(),
    ),
    notes: z.array(z.string()).default([]),
  })
  .strict();

export type DeliveryManifestInput = z.input<typeof deliveryManifestSchema>;
