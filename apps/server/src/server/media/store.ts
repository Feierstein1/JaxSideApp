import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getEnv } from '../env';

/**
 * Private object storage for photos (§12, D13, D25). Only the server talks to it; the
 * bucket is never public and the app never gets a storage URL (P6.4). Swappable so
 * tests can use memory.
 */
export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

class S3Store implements ObjectStore {
  private client: S3Client;
  private bucket: string;
  private ready: Promise<void> | null = null;

  constructor() {
    const env = getEnv();
    this.bucket = env.S3_BUCKET_MEDIA;
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  /** Dev convenience: create the private bucket the first time it's needed. */
  private ensureBucket() {
    this.ready ??= this.client
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => undefined)
      .catch(async () => {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      });
    return this.ready;
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async get(key: string) {
    return this.objects.get(key)?.body ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

let store: ObjectStore | null = null;
export function objectStore(): ObjectStore {
  store ??= new S3Store();
  return store;
}
/** Tests swap in a MemoryStore. */
export function setObjectStore(s: ObjectStore) {
  store = s;
}
