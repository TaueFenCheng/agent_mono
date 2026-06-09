import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AttachmentStorageService } from "./attachment.storage.js";
import { OBJECT_STORAGE_MODULE_OPTIONS, type ObjectStorageModuleOptions } from "./object-storage.constants.js";

@Module({})
export class ObjectStorageModule {
  static forRootAsync(): DynamicModule {
    return {
      module: ObjectStorageModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: OBJECT_STORAGE_MODULE_OPTIONS,
          inject: [ConfigService],
          useFactory: (configService: ConfigService): ObjectStorageModuleOptions => ({
            endpoint: configService.get<string>("objectStorage.endpoint") ?? "http://127.0.0.1:9000",
            region: configService.get<string>("objectStorage.region") ?? "us-east-1",
            bucket: configService.get<string>("objectStorage.bucket") ?? "intelligent-agent",
            accessKeyId: configService.get<string>("objectStorage.accessKeyId") ?? "minioadmin",
            secretAccessKey: configService.get<string>("objectStorage.secretAccessKey") ?? "minioadmin",
            forcePathStyle: configService.get<boolean>("objectStorage.forcePathStyle") ?? true,
            signTtlSeconds: configService.get<number>("objectStorage.signTtlSeconds") ?? 3600
          })
        },
        AttachmentStorageService
      ],
      exports: [AttachmentStorageService]
    };
  }
}
