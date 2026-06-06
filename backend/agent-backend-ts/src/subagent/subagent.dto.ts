import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import type { Provider } from "@tang-agent/core-types";

const PROVIDER_VALUES: Provider[] = ["openai", "anthropic", "gemini", "qwen", "glm", "deepseek"];
const SUBAGENT_ROLE_VALUES = ["planner", "researcher", "coder"] as const;

export class RoleModelOverrideDto {
  @IsOptional()
  @IsIn(PROVIDER_VALUES)
  provider?: Provider;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;
}

export class SubagentTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsIn(SUBAGENT_ROLE_VALUES)
  role!: "planner" | "researcher" | "coder";

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  prompt!: string;

  @IsOptional()
  @IsIn(PROVIDER_VALUES)
  provider?: Provider;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SubagentRunDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  threadId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  userId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  prompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SubagentTaskDto)
  tasks?: SubagentTaskDto[];

  @IsOptional()
  @IsIn(PROVIDER_VALUES)
  provider?: Provider;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledSkills?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  maxConcurrency?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(300000)
  taskTimeoutMs?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoleModelOverrideDto)
  planner?: RoleModelOverrideDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoleModelOverrideDto)
  researcher?: RoleModelOverrideDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoleModelOverrideDto)
  coder?: RoleModelOverrideDto;
}

export class SubagentJobIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  jobId!: string;
}

export class SubagentRunIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  runId!: string;
}

