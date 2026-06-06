export const REDIS_MODULE_OPTIONS = Symbol("REDIS_MODULE_OPTIONS");

export interface RedisModuleOptions {
  url: string;
  host: string;
  port: number;
}
