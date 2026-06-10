import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface JwtUser {
  sub: string;
  name?: string;
  roles?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 从 request.user（由 JwtAuthGuard 注入）中提取当前登录用户信息。
 *
 * 用法：
 *   @User() user: JwtUser          // 获取完整用户对象
 *   @User('sub') userId: string    // 仅获取 sub 字段
 */
export const User = createParamDecorator((key: keyof JwtUser | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as JwtUser | undefined;
  if (!user) return key ? undefined : {};
  return key ? user[key] : user;
});
