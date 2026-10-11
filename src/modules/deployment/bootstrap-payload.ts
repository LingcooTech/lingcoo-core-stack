import { httpError } from '../../lib/errors';
import type {
  DeliveryManifest,
  DeliveryManifestDomainSourceField,
  DeliveryManifestField,
} from '../../lib/delivery-manifest';
import type { DeploymentPolicy } from '../../lib/deployment-policy';
import type {
  DeliverySettingsService,
  DeliverySettingValues,
  DeliverySettingSecrets,
} from './delivery-settings';
import type { DeploymentRepository } from './repository';
import { normalizeHostname, type DeploymentRuntimeUpdatePolicy } from './configuration-model';
export function quoteShellArgument(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}
export function buildRemoteInstallCommand(input: {
  token: string;
  exchangeUrl: string;
  remoteInstallScriptUrl?: string;
  installPath?: string | null;
  repoUrl?: string;
  repoBranch?: string;
}) {
  if (!input.remoteInstallScriptUrl) throw httpError(422, 'Delivery installer is required');
  const commandParts = [
    `FD_STACK_DEPLOY_TOKEN=${quoteShellArgument(input.token)}`,
    `FD_STACK_EXCHANGE_URL=${quoteShellArgument(input.exchangeUrl)}`,
  ];

  if (input.installPath) {
    commandParts.push(`INSTALL_DIR=${quoteShellArgument(input.installPath)}`);
  }

  if (input.repoUrl) {
    commandParts.push(`REPO_URL=${quoteShellArgument(input.repoUrl)}`);
  }

  if (input.repoBranch) {
    commandParts.push(`REPO_BRANCH=${quoteShellArgument(input.repoBranch)}`);
  }

  commandParts.push(`bash <(curl -fsSL ${quoteShellArgument(input.remoteInstallScriptUrl)})`);

  return commandParts.join(' ');
}
export function buildExchangeCurl(token: string, publicBaseUrl: string) {
  return `curl -fsSL -X POST ${quoteShellArgument(new URL('/v1/deployments/bootstrap/exchange', publicBaseUrl).toString())} -H 'content-type: application/json' -d ${quoteShellArgument(JSON.stringify({ token }))}`;
}
interface BootstrapInput {
  deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>;
  manifest: DeliveryManifest | null;
  deliverySettings: Awaited<ReturnType<DeliverySettingsService['getStoredSettings']>>;
  deploymentValues: DeliverySettingValues;
  deploymentSecrets: DeliverySettingSecrets;
  policy: DeploymentPolicy;
  updatePolicy: DeploymentRuntimeUpdatePolicy;
  statusReportToken: string;
  publicBaseUrl: string;
  token?: string;
  sourceValue: (field: DeliveryManifestDomainSourceField) => string | undefined;
  resolveField: (input: {
    field: DeliveryManifestField;
    appValues: DeliverySettingValues;
    deploymentValues: DeliverySettingValues;
    appSecrets: DeliverySettingSecrets;
    deploymentSecrets: DeliverySettingSecrets;
  }) => string | boolean | undefined;
}
export function assembleDeploymentBootstrap({
  deployment,
  manifest,
  deliverySettings,
  deploymentValues,
  deploymentSecrets,
  policy,
  updatePolicy,
  statusReportToken,
  publicBaseUrl,
  token,
  sourceValue,
  resolveField,
}: BootstrapInput) {
  const appValues: DeliverySettingValues = {
    ...(deliverySettings?.values ?? {}),
  };
  const appSecrets: DeliverySettingSecrets = {
    ...(deliverySettings?.secrets ?? {}),
  };
  if (!manifest) throw httpError(422, 'A valid delivery manifest is required');
  const installer = {
    ...manifest.installer,
    installPath: deployment.installPath || manifest.installer.installPath,
  };

  const envDefaults: Record<string, string> = {};

  if (manifest) {
    for (const slot of manifest.domainSlots) {
      const value = sourceValue(slot.sourceField);
      if (value) {
        envDefaults[slot.envKey] = value;
      }
    }

    for (const field of [...manifest.envFields, ...manifest.secretFields]) {
      const resolved = resolveField({
        field,
        appValues,
        deploymentValues,
        appSecrets,
        deploymentSecrets,
      });

      if (typeof resolved === 'boolean') {
        envDefaults[field.key] = String(resolved);
        continue;
      }

      if (typeof resolved === 'string' && resolved.length > 0) {
        envDefaults[field.key] = resolved;
        if (field.key === 'GH_TOKEN' && !envDefaults.GITHUB_TOKEN) {
          envDefaults.GITHUB_TOKEN = resolved;
        }
      }
    }
  }

  const activeBindingSource =
    policy.domainBindingMode === 'lock_on_first_success' ? policy.domainBindingSource : 'none';
  envDefaults.FD_RUNTIME_IMAGE_UPDATE_POLICY = updatePolicy;
  envDefaults.FD_DOMAIN_BINDING_SOURCE = activeBindingSource;
  envDefaults.FD_DOMAIN_BINDING_SCOPE = policy.domainBindingScope;

  if (activeBindingSource !== 'none') {
    // Runtime host checks must use the exact deployed host, not the license binding scope.
    const boundHost = normalizeHostname(sourceValue(activeBindingSource));

    if (boundHost.length > 0) {
      envDefaults.FD_BOUND_HOST = boundHost;
    }
  }

  const exchangeUrl = new URL('/v1/deployments/bootstrap/exchange', publicBaseUrl).toString();
  envDefaults.FD_STACK_DEPLOYMENT_ID = deployment.id;
  envDefaults.FD_STACK_STATUS_REPORT_URL = new URL(
    '/v1/deployments/status/report',
    publicBaseUrl,
  ).toString();
  envDefaults.FD_STACK_STATUS_REPORT_TOKEN = statusReportToken;
  envDefaults.FD_STACK_ACTION_PULL_URL = new URL(
    '/v1/deployments/actions/pull',
    publicBaseUrl,
  ).toString();
  envDefaults.FD_STACK_ACTION_COMPLETE_URL = new URL(
    '/v1/deployments/actions/complete',
    publicBaseUrl,
  ).toString();

  return {
    installPath: installer.installPath,
    exchangeUrl,
    repository: {
      url: installer.repoUrl,
      branch: installer.repoBranch,
    },
    assets: manifest?.assets ?? [],
    envDefaults,
    remoteInstallCommand: token
      ? buildRemoteInstallCommand({
          token: token,
          exchangeUrl,
          installPath: installer.installPath,
          repoUrl: installer.repoUrl,
          repoBranch: installer.repoBranch,
          remoteInstallScriptUrl: installer.remoteInstallScriptUrl,
        })
      : null,
    notes: [
      'Installer bootstrap now follows the synced deliveryManifest and any saved app-level preset overrides.',
      'User-input deployment values override app defaults for the current deployment.',
    ],
  };
}
