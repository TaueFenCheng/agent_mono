import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UploadAttachmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  threadId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  runId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  metadata?: string;
}

export class AttachmentIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  attachmentId!: string;
}

export class AttachmentJobIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  jobId!: string;
}

export class ListAttachmentsQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  threadId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SearchAttachmentsQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  q!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  threadId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
