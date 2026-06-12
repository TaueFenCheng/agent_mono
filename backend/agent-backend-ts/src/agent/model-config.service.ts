import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../infra/database.service.js";
import {
  BUILTIN_PROVIDERS,
  getBuiltinProviders,
  type CreateModelConfigDto,
  type ModelConfigResponse,
  type UpdateModelConfigDto
} from "./model-config.dto.js";

interface EnvModelSeed {
  provider: string;
  name: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

const ENV_PROVIDER_CONFIG: Record<string, { apiKeyEnv: string[]; modelEnv: string; baseUrlEnv: string }> = {
  qwen: {
    apiKeyEnv: ["QWEN_API_KEY"],
    modelEnv: "QWEN_MODEL",
    baseUrlEnv: "QWEN_BASE_URL"
  },
  glm: {
    apiKeyEnv: ["GLM_API_KEY"],
    modelEnv: "GLM_MODEL",
    baseUrlEnv: "GLM_BASE_URL"
  },
  deepseek: {
    apiKeyEnv: ["DEEPSEEK_API_KEY"],
    modelEnv: "DEEPSEEK_MODEL",
    baseUrlEnv: "DEEPSEEK_BASE_URL"
  },
  openai: {
    apiKeyEnv: ["OPENAI_API_KEY"],
    modelEnv: "OPENAI_MODEL",
    baseUrlEnv: "OPENAI_BASE_URL"
  },
  anthropic: {
    apiKeyEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    modelEnv: "ANTHROPIC_MODEL",
    baseUrlEnv: "ANTHROPIC_BASE_URL"
  }
};

@Injectable()
export class ModelConfigService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string): Promise<ModelConfigResponse[]> {
    const prisma = this.db.getPrisma();
    await this.ensureUserModelSeeds(userId);
    const configs = await prisma.modelConfig.findMany({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
    });
    return configs.map((c) => this.toResponse(c));
  }

  async get(id: string, userId: string): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();
    const config = await prisma.modelConfig.findFirst({ where: { id, userId } });
    if (!config) throw new NotFoundException("Model config not found");
    return this.toResponse(config);
  }

  async getActive(userId: string): Promise<ModelConfigResponse | null> {
    const prisma = this.db.getPrisma();
    await this.ensureUserModelSeeds(userId);
    const config = await prisma.modelConfig.findFirst({ where: { userId, isActive: true } });
    return config ? this.toResponse(config) : null;
  }

  async create(dto: CreateModelConfigDto, userId: string): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();

    // 检查名称是否重复
    const existing = await prisma.modelConfig.findFirst({
      where: { userId, provider: dto.provider, name: dto.name }
    });
    if (existing) {
      throw new BadRequestException(`Config name "${dto.name}" already exists for provider "${dto.provider}"`);
    }

    // 如果设置为激活，先取消其他激活
    if (dto.isActive) {
      await this.deactivateAll(userId);
    }

    // 如果没有激活的配置，第一个配置自动激活
    const count = await prisma.modelConfig.count({ where: { userId } });
    const isActive = dto.isActive || count === 0;

    const config = await prisma.modelConfig.create({
      data: {
        userId,
        name: dto.name,
        provider: dto.provider,
        model: dto.model,
        apiKey: dto.apiKey,
        baseUrl: dto.baseUrl,
        isActive,
        isCustom: !(BUILTIN_PROVIDERS as readonly string[]).includes(dto.provider)
      }
    });

    return this.toResponse(config);
  }

  async update(id: string, dto: UpdateModelConfigDto, userId: string): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();
    const existing = await prisma.modelConfig.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Model config not found");

    const config = await prisma.modelConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.apiKey !== undefined && { apiKey: dto.apiKey }),
        ...(dto.baseUrl !== undefined && { baseUrl: dto.baseUrl })
      }
    });

    return this.toResponse(config);
  }

  async delete(id: string, userId: string): Promise<{ deleted: boolean }> {
    const prisma = this.db.getPrisma();
    const existing = await prisma.modelConfig.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Model config not found");

    await prisma.modelConfig.delete({ where: { id } });

    // 如果删除的是激活配置，激活第一个可用配置
    if (existing.isActive) {
      const first = await prisma.modelConfig.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
      if (first) {
        await prisma.modelConfig.update({ where: { id: first.id }, data: { isActive: true } });
      }
    }

    return { deleted: true };
  }

  async activate(id: string, userId: string): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();
    const existing = await prisma.modelConfig.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Model config not found");

    // 取消所有激活
    await this.deactivateAll(userId);

    // 激活指定配置
    const config = await prisma.modelConfig.update({
      where: { id },
      data: { isActive: true }
    });

    return this.toResponse(config);
  }

  private async deactivateAll(userId: string): Promise<void> {
    const prisma = this.db.getPrisma();
    await prisma.modelConfig.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false }
    });
  }

  private getEnvModelSeeds(): EnvModelSeed[] {
    const builtinByName = new Map(getBuiltinProviders().map((item) => [item.name, item]));

    return BUILTIN_PROVIDERS.flatMap((provider) => {
      const envConfig = ENV_PROVIDER_CONFIG[provider];
      const builtin = builtinByName.get(provider);
      if (!envConfig || !builtin) return [];

      const apiKey = envConfig.apiKeyEnv.map((key) => process.env[key]?.trim()).find(Boolean);
      if (!apiKey) return [];

      const model = process.env[envConfig.modelEnv]?.trim() || builtin.defaultModel;
      const baseUrl = process.env[envConfig.baseUrlEnv]?.trim() || builtin.defaultBaseUrl;
      const displayName = `${provider} (env)`;

      return [{
        provider,
        name: displayName,
        model,
        apiKey,
        baseUrl
      }];
    });
  }

  private async ensureUserModelSeeds(userId: string): Promise<void> {
    const prisma = this.db.getPrisma();
    const existingCount = await prisma.modelConfig.count({ where: { userId } });
    if (existingCount > 0) return;

    const seeds = this.getEnvModelSeeds();
    if (seeds.length === 0) return;

    const defaultProvider = (process.env.AGENT_PROVIDER ?? "").trim().toLowerCase();

    for (const [index, seed] of seeds.entries()) {
      await prisma.modelConfig.create({
        data: {
          userId,
          name: seed.name,
          provider: seed.provider,
          model: seed.model,
          apiKey: seed.apiKey,
          baseUrl: seed.baseUrl,
          isActive: seed.provider === defaultProvider || (index === 0 && !defaultProvider),
          isCustom: false
        }
      });
    }
  }

  private toResponse(config: any): ModelConfigResponse {
    return {
      id: config.id,
      name: config.name,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      isActive: config.isActive,
      isCustom: config.isCustom,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString()
    };
  }
}
