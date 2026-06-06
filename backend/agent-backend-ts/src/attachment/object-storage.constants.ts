export const OBJECT_STORAGE_MODULE_OPTIONS = Symbol("OBJECT_STORAGE_MODULE_OPTIONS");

export interface ObjectStorageModuleOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  signTtlSeconds: number;
}
