import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DATABASE_MODULE_OPTIONS, type DatabaseModuleOptions } from "./database.constants.js";
import { DatabaseService } from "./database.service.js";

@Module({})
export class DatabaseModule {
  static forRootAsync(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: DATABASE_MODULE_OPTIONS,
          inject: [ConfigService],
          useFactory: (configService: ConfigService): DatabaseModuleOptions => {
            const url = configService.get<string>("postgres.url");
            if (!url) {
              throw new Error("Missing required config: postgres.url");
            }
            return { url };
          }
        },
        DatabaseService
      ],
      exports: [DatabaseService]
    };
  }
}
