import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { REDIS_MODULE_OPTIONS, type RedisModuleOptions } from "./redis.constants.js";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  private connected = false;

  constructor(@Inject(REDIS_MODULE_OPTIONS) private readonly options: RedisModuleOptions) {
    this.redis = new Redis(this.options.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
  }

  private async ensureConnected() {
    if (this.connected) return;
    try {
      await this.redis.connect();
      this.connected = true;
    } catch (error) {
      this.logger.warn(`redis connect failed: ${String(error)}`);
    }
  }

  async health(): Promise<"up" | "down"> {
    await this.ensureConnected();
    try {
      const pong = await this.redis.ping();
      return pong === "PONG" ? "up" : "down";
    } catch {
      return "down";
    }
  }

  async setCachedOutput(key: string, value: string, ttlSeconds = 120): Promise<void> {
    await this.ensureConnected();
    await this.redis.set(key, value, "EX", ttlSeconds);
  }

  async getCachedOutput(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.redis.get(key);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
