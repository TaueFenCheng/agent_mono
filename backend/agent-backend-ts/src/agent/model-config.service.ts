import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../infra/database.service.js";
import type { CreateModelConfigDto, ModelConfigResponse, UpdateModelConfigDto } from "./model-config.dto.js";

@Injectable()
export class ModelConfigService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<ModelConfigResponse[]> {
    const prisma = this.db.getPrisma();
    const configs = await prisma.modelConfig.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
    });
    return configs.map((c) => this.toResponse(c));
  }

  async get(id: string): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();
    const config = await prisma.modelConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException("Model config not found");
    return this.toResponse(config);
  }

  async getActive(): Promise<ModelConfigResponse | null> {
    const prisma = this.db.getPrisma();
    const config = await prisma.modelConfig.findFirst({ where: { isActive: true } });
    return config ? this.toResponse(config) : null;
  }

  async create(dto: CreateModelConfigDto): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();

    // 检查名称是否重复
    const existing = await prisma.modelConfig.findUnique({
      where: { provider_name: { provider: dto.provider, name: dto.name } }
    });
    if (existing) {
      throw new BadRequestException(`Config name "${dto.name}" already exists for provider "${dto.provider}"`);
    }

    // 如果设置为激活，先取消其他激活
    if (dto.isActive) {
      await this.deactivateAll();
    }

    // 如果没有激活的配置，第一个配置自动激活
    const count = await prisma.modelConfig.count();
    const isActive = dto.isActive || count === 0;

    const config = await prisma.modelConfig.create({
      data: {
        name: dto.name,
        provider: dto.provider,
        model: dto.model,
        apiKey: dto.apiKey,
        baseUrl: dto.baseUrl,
        isActive,
        isCustom: !["qwen", "glm", "deepseek", "openai"].includes(dto.provider)
      }
    });

    return this.toResponse(config);
  }

  async update(id: string, dto: UpdateModelConfigDto): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();
    const existing = await prisma.modelConfig.findUnique({ where: { id } });
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

  async delete(id: string): Promise<{ deleted: boolean }> {
    const prisma = this.db.getPrisma();
    const existing = await prisma.modelConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Model config not found");

    await prisma.modelConfig.delete({ where: { id } });

    // 如果删除的是激活配置，激活第一个可用配置
    if (existing.isActive) {
      const first = await prisma.modelConfig.findFirst({ orderBy: { createdAt: "asc" } });
      if (first) {
        await prisma.modelConfig.update({ where: { id: first.id }, data: { isActive: true } });
      }
    }

    return { deleted: true };
  }

  async activate(id: string): Promise<ModelConfigResponse> {
    const prisma = this.db.getPrisma();
    const existing = await prisma.modelConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Model config not found");

    // 取消所有激活
    await this.deactivateAll();

    // 激活指定配置
    const config = await prisma.modelConfig.update({
      where: { id },
      data: { isActive: true }
    });

    return this.toResponse(config);
  }

  private async deactivateAll(): Promise<void> {
    const prisma = this.db.getPrisma();
    await prisma.modelConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });
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
