import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageSettings } from '@lingcoo/contracts';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

// Providers are constructed with current encrypted settings. Share bounded connection pools
// so per-request clients and credential changes do not create unbounded idle sockets.
const httpAgent = new HttpAgent({
  keepAlive: true,
  maxSockets: 32,
  maxFreeSockets: 8,
  timeout: 30_000,
});
const httpsAgent = new HttpsAgent({
  keepAlive: true,
  maxSockets: 32,
  maxFreeSockets: 8,
  timeout: 30_000,
});
export class S3StorageProvider {
  constructor(
    private readonly config: StorageSettings,
    private readonly client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKey ?? '', secretAccessKey: config.secretKey ?? '' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
      requestHandler: { httpAgent, httpsAgent, connectionTimeout: 5_000 },
    }),
  ) {}
  test() {
    return this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }
  write(key: string, body: Buffer, contentType: string) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentMD5: createHash('md5').update(body).digest('base64'),
      }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
  }
  read(key: string) {
    return this.client
      .send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30_000),
      })
      .then((result) => ({ ...result, Body: result.Body as Readable | undefined }));
  }
  delete(key: string) {
    return this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(15_000),
    });
  }
}
