import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export const BUILTIN_PROVIDERS = ["qwen", "glm", "deepseek", "openai", "anthropic"] as const;

export class CreateModelConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  provider!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @IsString()
  @IsNotEmpty()
  baseUrl!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateModelConfigDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKey?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  baseUrl?: string;
}

export class ModelConfigIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id!: string;
}

export interface ModelConfigResponse {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  isActive: boolean;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInfo {
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  isBuiltin: boolean;
}

export function getBuiltinProviders(): ProviderInfo[] {
  return [
    {
      name: "qwen",
      defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultModel: "qwen-plus",
      isBuiltin: true
    },
    {
      name: "glm",
      defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
      defaultModel: "glm-4.5",
      isBuiltin: true
    },
    {
      name: "deepseek",
      defaultBaseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
      isBuiltin: true
    },
    {
      name: "openai",
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4.1-mini",
      isBuiltin: true
    },
    {
      name: "anthropic",
      defaultBaseUrl: "https://api.anthropic.com",
      defaultModel: "claude-3-5-haiku-latest",
      isBuiltin: true
    }
  ];
}
