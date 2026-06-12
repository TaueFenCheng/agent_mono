import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { User } from "../common/decorators/user.decorator.js";
import { getBuiltinProviders, type ProviderInfo } from "./model-config.dto.js";
import {
  CreateModelConfigDto,
  ModelConfigIdParamDto,
  UpdateModelConfigDto,
  type ModelConfigResponse
} from "./model-config.dto.js";
import { ModelConfigService } from "./model-config.service.js";

@Controller("v1/model-configs")
export class ModelConfigController {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  @Get()
  async list(@User("sub") userId: string): Promise<{ configs: ModelConfigResponse[] }> {
    const configs = await this.modelConfigService.list(userId);
    return { configs };
  }

  @Get("active")
  async getActive(@User("sub") userId: string): Promise<{ config: ModelConfigResponse | null }> {
    const config = await this.modelConfigService.getActive(userId);
    return { config };
  }

  @Get(":id")
  async get(@Param() params: ModelConfigIdParamDto, @User("sub") userId: string): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.get(params.id, userId);
    return { config };
  }

  @Post()
  async create(@Body() dto: CreateModelConfigDto, @User("sub") userId: string): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.create(dto, userId);
    return { config };
  }

  @Put(":id")
  async update(
    @Param() params: ModelConfigIdParamDto,
    @Body() dto: UpdateModelConfigDto,
    @User("sub") userId: string
  ): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.update(params.id, dto, userId);
    return { config };
  }

  @Delete(":id")
  async delete(@Param() params: ModelConfigIdParamDto, @User("sub") userId: string): Promise<{ deleted: boolean }> {
    return this.modelConfigService.delete(params.id, userId);
  }

  @Post(":id/activate")
  async activate(@Param() params: ModelConfigIdParamDto, @User("sub") userId: string): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.activate(params.id, userId);
    return { config };
  }
}

@Controller("v1/providers")
export class ProviderController {
  @Get()
  list(): { providers: ProviderInfo[] } {
    return { providers: getBuiltinProviders() };
  }
}
