import type { UpsertDeliverySettingsInput } from '@/api/delivery';
import type { DeliverySettingsOverview } from '@/api/types';

export type DeliveryMode = 'none' | 'one_click';

export interface DeliveryManifestSourceDraft {
  repoUrl: string;
  repoBranch: string;
  manifestPath: string;
  manifestUrl: string;
}

export interface DeliverySettingsDraft {
  repoUrl: string;
  repoBranch: string;
  frontendImage: string;
  websocketImage: string;
  letsencryptEmail: string;
  acrUsername: string;
  acrPassword: string;
  githubToken: string;
  wordpressFetchReleaseAssets: boolean;
  wordpressRunInit: boolean;
  wordpressReleaseOwner: string;
  fdThemeReleaseTag: string;
  fdAdminUiReleaseTag: string;
  fdMemberReleaseTag: string;
  fdPaymentReleaseTag: string;
  fdCommerceReleaseTag: string;
  fdContentTypesReleaseTag: string;
  fdWebsocketPushReleaseTag: string;
  wpgraphqlJwtAuthReleaseTag: string;
  wpgraphqlTaxQueryRef: string;
}

export interface DeliverySecretState {
  acrPasswordConfigured: boolean;
  githubTokenConfigured: boolean;
}

export const DEFAULT_DELIVERY_SETTINGS_DRAFT: DeliverySettingsDraft = {
  repoUrl: 'https://github.com/FutureDecade/fd-headless-wp-system.git',
  repoBranch: 'main',
  frontendImage: '',
  websocketImage: '',
  letsencryptEmail: '',
  acrUsername: '',
  acrPassword: '',
  githubToken: '',
  wordpressFetchReleaseAssets: true,
  wordpressRunInit: true,
  wordpressReleaseOwner: 'FutureDecade',
  fdThemeReleaseTag: 'v1.0.7',
  fdAdminUiReleaseTag: 'v1.3.1',
  fdMemberReleaseTag: 'v1.0.1',
  fdPaymentReleaseTag: 'v1.0.0',
  fdCommerceReleaseTag: 'v1.0.0',
  fdContentTypesReleaseTag: 'v0.1.0',
  fdWebsocketPushReleaseTag: 'v1.0.0',
  wpgraphqlJwtAuthReleaseTag: 'v0.7.2',
  wpgraphqlTaxQueryRef: 'v0.2.0',
};

export const EMPTY_DELIVERY_SECRET_STATE: DeliverySecretState = {
  acrPasswordConfigured: false,
  githubTokenConfigured: false,
};

export const DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT: DeliveryManifestSourceDraft = {
  repoUrl: '',
  repoBranch: 'main',
  manifestPath: 'fd-delivery.manifest.json',
  manifestUrl: '',
};

function normalizeMeta(meta: unknown) {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

export function supportsOneClickDelivery(appType: string) {
  const normalized = appType.trim().toLowerCase();
  return normalized === 'service' || normalized === 'web_app';
}

export function getAppDeliveryMode(input: {
  type: string;
  meta?: Record<string, unknown> | undefined;
}): DeliveryMode {
  const meta = normalizeMeta(input.meta);
  const rawMode = meta.deliveryMode;

  if (rawMode === 'none' || rawMode === 'one_click') {
    return rawMode;
  }

  return supportsOneClickDelivery(input.type) ? 'one_click' : 'none';
}

export function createDeliverySettingsDraft(
  overview?: DeliverySettingsOverview | null,
): DeliverySettingsDraft {
  return {
    ...DEFAULT_DELIVERY_SETTINGS_DRAFT,
    ...(overview?.values ?? {}),
    acrPassword: '',
    githubToken: '',
  };
}

export function createDeliverySecretState(
  overview?: DeliverySettingsOverview | null,
): DeliverySecretState {
  return {
    acrPasswordConfigured: overview?.secrets.acrPassword.configured ?? false,
    githubTokenConfigured: overview?.secrets.githubToken.configured ?? false,
  };
}

export function createDeliveryManifestSourceDraft(input?: {
  meta?: Record<string, unknown> | undefined;
} | null): DeliveryManifestSourceDraft {
  const meta = normalizeMeta(input?.meta);
  const source = normalizeMeta(meta.deliveryManifestSource);

  return {
    repoUrl: typeof source.repoUrl === 'string' ? source.repoUrl : '',
    repoBranch:
      typeof source.repoBranch === 'string' && source.repoBranch.trim()
        ? source.repoBranch
        : DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.repoBranch,
    manifestPath:
      typeof source.manifestPath === 'string' && source.manifestPath.trim()
        ? source.manifestPath
        : DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.manifestPath,
    manifestUrl: typeof source.manifestUrl === 'string' ? source.manifestUrl : '',
  };
}

export function buildDeliveryManifestSourcePayload(draft: DeliveryManifestSourceDraft) {
  const repoUrl = draft.repoUrl.trim();
  const repoBranch = draft.repoBranch.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.repoBranch;
  const manifestPath =
    draft.manifestPath.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.manifestPath;
  const manifestUrl = draft.manifestUrl.trim();

  if (!repoUrl && !manifestUrl) {
    return {};
  }

  const payload: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
    manifestUrl?: string;
  } = {
    repoBranch,
    manifestPath,
  };

  if (repoUrl) {
    payload.repoUrl = repoUrl;
  }

  if (manifestUrl) {
    payload.manifestUrl = manifestUrl;
  }

  return payload;
}

export function serializeDeliveryManifestSourceDraft(draft: DeliveryManifestSourceDraft) {
  return JSON.stringify({
    repoUrl: draft.repoUrl.trim(),
    repoBranch: draft.repoBranch.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.repoBranch,
    manifestPath:
      draft.manifestPath.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.manifestPath,
    manifestUrl: draft.manifestUrl.trim(),
  });
}

export function computeDeliveryConfigured(
  draft: DeliverySettingsDraft,
  secrets: DeliverySecretState,
) {
  return Boolean(
    draft.frontendImage.trim() &&
      draft.websocketImage.trim() &&
      draft.acrUsername.trim() &&
      (draft.acrPassword.trim() || secrets.acrPasswordConfigured) &&
      (draft.githubToken.trim() || secrets.githubTokenConfigured),
  );
}

export function serializeDeliverySettingsDraft(
  mode: DeliveryMode,
  draft: DeliverySettingsDraft,
  secrets: DeliverySecretState,
) {
  if (mode !== 'one_click') {
    return null;
  }

  return {
    ...draft,
    acrPasswordConfigured: secrets.acrPasswordConfigured,
    githubTokenConfigured: secrets.githubTokenConfigured,
  };
}

export function buildDeliverySettingsPayload(
  draft: DeliverySettingsDraft,
): UpsertDeliverySettingsInput {
  const payload: UpsertDeliverySettingsInput = {
    wordpressFetchReleaseAssets: draft.wordpressFetchReleaseAssets,
    wordpressRunInit: draft.wordpressRunInit,
  };

  const putText = (key: string, value: string) => {
    const normalized = value.trim();
    if (normalized) {
      (payload as Record<string, string | boolean | undefined>)[key] = normalized;
    }
  };

  putText('repoUrl', draft.repoUrl);
  putText('repoBranch', draft.repoBranch);
  putText('frontendImage', draft.frontendImage);
  putText('websocketImage', draft.websocketImage);
  putText('letsencryptEmail', draft.letsencryptEmail);
  putText('acrUsername', draft.acrUsername);
  putText('acrPassword', draft.acrPassword);
  putText('githubToken', draft.githubToken);
  putText('wordpressReleaseOwner', draft.wordpressReleaseOwner);
  putText('fdThemeReleaseTag', draft.fdThemeReleaseTag);
  putText('fdAdminUiReleaseTag', draft.fdAdminUiReleaseTag);
  putText('fdMemberReleaseTag', draft.fdMemberReleaseTag);
  putText('fdPaymentReleaseTag', draft.fdPaymentReleaseTag);
  putText('fdCommerceReleaseTag', draft.fdCommerceReleaseTag);
  putText('fdContentTypesReleaseTag', draft.fdContentTypesReleaseTag);
  putText('fdWebsocketPushReleaseTag', draft.fdWebsocketPushReleaseTag);
  putText('wpgraphqlJwtAuthReleaseTag', draft.wpgraphqlJwtAuthReleaseTag);
  putText('wpgraphqlTaxQueryRef', draft.wpgraphqlTaxQueryRef);

  return payload;
}
