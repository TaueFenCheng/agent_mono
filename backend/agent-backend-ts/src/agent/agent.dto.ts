import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import type { Provider, Role } from "@intelligent-agent/core-types";

const ROLE_VALUES: Role[] = ["system", "user", "assistant", "tool"];
const PROVIDER_VALUES: Provider[] = ["openai", "anthropic", "gemini", "qwen", "glm", "deepseek"];

export class ChatMessageDto {
  @IsIn(ROLE_VALUES)
  role!: Role;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsNotEmpty()
  createdAt!: string;
}

export class AgentRunDto {
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
  message?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages?: ChatMessageDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsIn(PROVIDER_VALUES)
  provider?: Provider;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledSkills?: string[];
}

export class CreateMemoryFactDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InvokeMcpToolDto {
  @IsOptional()
  arguments?: unknown;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  threadId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  runId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ThreadIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  threadId!: string;
}

export class RunIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  runId!: string;
}

export class JobIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  jobId!: string;
}

export class FactIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  factId!: string;
}

export class ThreadFactParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  threadId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  factId!: string;
}

export class SkillNameParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  skillName!: string;
}

export class ToolNameParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  toolName!: string;
}

export class ListThreadsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListSkillsQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabledOnly?: boolean;
}

export class ListMcpToolsQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  threadId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  runId?: string;
}
