import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sub!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
