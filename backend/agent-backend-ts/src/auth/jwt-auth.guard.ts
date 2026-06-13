import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

const ENV_JWT_SECRET = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = Reflect.getOwnMetadata(IS_PUBLIC_KEY, context.getHandler())
      ?? Reflect.getOwnMetadata(IS_PUBLIC_KEY, context.getClass())
      ?? this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const authHeader = request.headers.authorization ?? request.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      request.user = await this.jwtService.verifyAsync(token, { secret: ENV_JWT_SECRET });
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
