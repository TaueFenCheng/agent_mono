import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { OBJECT_STORAGE_MODULE_OPTIONS, type ObjectStorageModuleOptions } from "./object-storage.constants.js";

async function streamToBuffer(stream: Readable | ReadableStream | Blob): Promise<Buffer> {
  if (stream instanceof Blob) {
    return Buffer.from(await stream.arrayBuffer());
  }

  if (typeof (stream as ReadableStream).getReader === "function") {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    const parts: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parts.push(value);
    }
    return Buffer.concat(parts.map((part) => Buffer.from(part)));
  }

  const nodeStream = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of nodeStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class AttachmentStorageService {
  private readonly bucket: string;
  private readonly defaultUrlTtlSeconds: number;
  private readonly client: S3Client;

  constructor(@Inject(OBJECT_STORAGE_MODULE_OPTIONS) options: ObjectStorageModuleOptions) {
    this.bucket = options.bucket;
    this.defaultUrlTtlSeconds = options.signTtlSeconds;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey
      }
    });
  }

  getBucket(): string {
    return this.bucket;
  }

  async health(): Promise<"up" | "down"> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return "up";
    } catch {
      return "down";
    }
  }

  async uploadObject(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType
      })
    );
  }

  async downloadObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );

    if (!response.Body) {
      throw new BadRequestException(`Object has no body: ${key}`);
    }

    return streamToBuffer(response.Body as Readable | ReadableStream | Blob);
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const ttl = expiresInSeconds ?? this.defaultUrlTtlSeconds;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      }),
      { expiresIn: ttl }
    );
  }
}
