import path from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AgentController } from "./agent/agent.controller.js";
import { AgentService } from "./agent/agent.service.js";
import { AgentQueueService } from "./agent/agent-queue.service.js";
import { AgentQueueProcessor } from "./agent/agent-queue.processor.js";
import { HealthController } from "./health/health.controller.js";
import { SubagentController } from "./subagent/subagent.controller.js";
import { SubagentService } from "./subagent/subagent.service.js";
import { AttachmentController } from "./attachment/attachment.controller.js";
import { AttachmentService } from "./attachment/attachment.service.js";
import { ModelConfigController, ProviderController } from "./agent/model-config.controller.js";
import { ModelConfigService } from "./agent/model-config.service.js";
import postgresConfig from "./config/postgres.config.js";
import redisConfig from "./config/redis.config.js";
import authConfig from "./config/auth.config.js";
import objectStorageConfig from "./config/object-storage.config.js";
import attachmentConfig from "./config/attachment.config.js";
import { validateEnv } from "./config/env.validation.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { JwtAuthGuard } from "./auth/jwt-auth.guard.js";
import { DatabaseModule } from "./infra/database.module.js";
import { RedisModule } from "./infra/redis.module.js";
import { ObjectStorageModule } from "./attachment/object-storage.module.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        path.resolve(moduleDir, "../.env"),
        path.resolve(moduleDir, "../../../.env")
      ],
      load: [postgresConfig, redisConfig, authConfig, objectStorageConfig, attachmentConfig],
      validate: validateEnv
    }),
    DatabaseModule.forRootAsync(),
    RedisModule.forRootAsync(),
    ObjectStorageModule.forRootAsync(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // jsonwebtoken types narrow expiresIn to `ms` StringValue; runtime accepts standard values like "7d".
        // Cast keeps config-driven string support without coupling to `ms` types.
        signOptions: {
          expiresIn: (configService.get<string>("auth.jwtExpiresIn") ?? "7d") as any
        },
        secret: configService.get<string>("auth.jwtSecret") ?? "dev-jwt-secret-change-me",
      })
    })
  ],
  controllers: [AuthController, AgentController, SubagentController, AttachmentController, HealthController, ModelConfigController, ProviderController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    AuthService,
    AgentService,
    SubagentService,
    AttachmentService,
    ModelConfigService,
    AgentQueueService,
    AgentQueueProcessor
  ]
})
export class AppModule {}
