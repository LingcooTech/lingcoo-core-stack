import { deliveryManifestSchema } from '@lingcoo/contracts';
import type { ComposePlan } from './compose-plan';

/** Compatibility view for the existing configuration form; execution uses the pinned plan. */
export function composeManifest(plan: ComposePlan, publicBaseUrl: string) {
  const generated = new Set((plan.fields.generatedSecrets ?? []).map((field) => field.key));
  return deliveryManifestSchema.parse({
    version: '1',
    installer: {
      repoUrl: publicBaseUrl,
      repoBranch: plan.commit,
      remoteInstallScriptUrl: new URL(
        '/v1/deployments/bootstrap/install.sh',
        publicBaseUrl,
      ).toString(),
      installPath: '/opt/lingcoo/instances',
    },
    groups: [],
    domainSlots: plan.fields.domains.length
      ? plan.fields.domains
      : [
          {
            key: 'primary',
            label: '应用域名',
            envKey: 'STACK_PUBLIC_HOSTNAME',
            sourceField: 'primaryDomain',
            required: true,
          },
        ],
    envFields: plan.fields.env,
    secretFields: plan.fields.secrets.filter((field) => !generated.has(field.key)),
    assets: [],
    notes: [],
  });
}
