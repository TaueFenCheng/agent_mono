import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  /** 用户名，唯一标识 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  /** 明文密码（与 encryptedPassword 二选一） */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  /** RSA 加密后的密码（与 password 二选一） */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  encryptedPassword?: string;

  /** 显示名称，不传则默认使用用户名 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;
}

export class LoginDto {
  /** 用户名 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  /** 明文密码（与 encryptedPassword 二选一） */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;

  /** RSA 加密后的密码（与 password 二选一） */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  encryptedPassword?: string;
}

export class TokenResponseDto {
  /** 令牌类型，固定 Bearer */
  tokenType: string;
  /** JWT 访问令牌 */
  accessToken: string;
  /** 过期时间描述，如 "7d" */
  expiresIn: string;
  /** 用户信息 */
  user: { sub: string; name: string };
}
