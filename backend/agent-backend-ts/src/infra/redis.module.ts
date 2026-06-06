import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { REDIS_MODULE_OPTIONS, type RedisModuleOptions } from "./redis.constants.js";
import { RedisService } from "./redis.service.js";

@Module({})
export class RedisModule {
  static forRootAsync(): DynamicModule {
    return {
      module: RedisModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: REDIS_MODULE_OPTIONS,
          inject: [ConfigService],
          useFactory: (configService: ConfigService): RedisModuleOptions => ({
            url: configService.get<string>("redis.url") ?? "redis://127.0.0.1:6379",
            host: configService.get<string>("redis.host") ?? "127.0.0.1",
            port: configService.get<number>("redis.port") ?? 6379
          })
        },
        RedisService
      ],
      exports: [RedisService, REDIS_MODULE_OPTIONS]
    };
  }
}
