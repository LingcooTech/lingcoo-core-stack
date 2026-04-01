import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import CrClient, { GetAuthorizationTokenRequest } from '@alicloud/cr20181201';

import type { AppEnv } from './env';

export type AcrTemporaryCredential = {
  username: string;
  password: string;
  expiresAt: Date | null;
};

export class AliyunAcrService {
  constructor(private readonly env: AppEnv) {}

  isTemporaryCredentialModeEnabled() {
    return Boolean(
      this.env.ALIYUN_ACCESS_KEY_ID &&
        this.env.ALIYUN_ACCESS_KEY_SECRET &&
        (this.env.ACR_OPENAPI_ENDPOINT || this.env.ACR_REGION_ID)
    );
  }

  private createClient() {
    if (!this.isTemporaryCredentialModeEnabled()) {
      return null;
    }

    const endpoint =
      this.env.ACR_OPENAPI_ENDPOINT ||
      (this.env.ACR_REGION_ID ? `cr.${this.env.ACR_REGION_ID}.aliyuncs.com` : undefined);

    if (!endpoint) {
      return null;
    }

    return new CrClient(
      new OpenApiConfig({
        accessKeyId: this.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: this.env.ALIYUN_ACCESS_KEY_SECRET,
        endpoint,
        regionId: this.env.ACR_REGION_ID,
        connectTimeout: 5000,
        readTimeout: 5000
      })
    );
  }

  async issueTemporaryCredential(): Promise<AcrTemporaryCredential | null> {
    const client = this.createClient();
    if (!client) {
      return null;
    }

    const response = await client.getAuthorizationToken(
      new GetAuthorizationTokenRequest({
        instanceId: this.env.ACR_INSTANCE_ID || undefined
      })
    );

    const body = response.body;
    if (!body?.isSuccess || !body.tempUsername || !body.authorizationToken) {
      throw new Error(body?.code || 'Failed to issue ACR temporary credential');
    }

    return {
      username: body.tempUsername,
      password: body.authorizationToken,
      expiresAt: typeof body.expireTime === 'number' ? new Date(body.expireTime) : null
    };
  }
}
