import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
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
  async list(): Promise<{ configs: ModelConfigResponse[] }> {
    const configs = await this.modelConfigService.list();
    return { configs };
  }

  @Get("active")
  async getActive(): Promise<{ config: ModelConfigResponse | null }> {
    const config = await this.modelConfigService.getActive();
    return { config };
  }

  @Get(":id")
  async get(@Param() params: ModelConfigIdParamDto): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.get(params.id);
    return { config };
  }

  @Post()
  async create(@Body() dto: CreateModelConfigDto): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.create(dto);
    return { config };
  }

  @Put(":id")
  async update(
    @Param() params: ModelConfigIdParamDto,
    @Body() dto: UpdateModelConfigDto
  ): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.update(params.id, dto);
    return { config };
  }

  @Delete(":id")
  async delete(@Param() params: ModelConfigIdParamDto): Promise<{ deleted: boolean }> {
    return this.modelConfigService.delete(params.id);
  }

  @Post(":id/activate")
  async activate(@Param() params: ModelConfigIdParamDto): Promise<{ config: ModelConfigResponse }> {
    const config = await this.modelConfigService.activate(params.id);
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
