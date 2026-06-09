import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@intelligent-agent/core-types";
import { AgentService } from "../agent/agent.service.js";
import { DatabaseService } from "../infra/database.service.js";
import { RedisService } from "../infra/redis.service.js";
import { Public } from "../auth/public.decorator.js";

@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly agentService: AgentService
  ) {}

  @Get("health")
  @Public()
  async health(): Promise<HealthResponse> {
    const [postgres, redis] = await Promise.all([this.db.health(), this.redis.health()]);
    const checkpointer = await this.agentService.getCheckpointerKind().catch(() => (postgres === "up" ? "postgres" : "memory"));
    return { status: "ok", postgres, redis, checkpointer, at: new Date().toISOString() };
  }
}
