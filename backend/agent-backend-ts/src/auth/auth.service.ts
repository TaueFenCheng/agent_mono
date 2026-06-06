import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import type { CreateTokenDto } from "./auth.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  createAccessToken(payload: CreateTokenDto, bootstrapKey?: string) {
    const expectedBootstrapKey = this.configService.get<string>("auth.bootstrapKey") ?? "";
    if (expectedBootstrapKey && bootstrapKey !== expectedBootstrapKey) {
      throw new UnauthorizedException("Invalid bootstrap key");
    }

    const tokenPayload = {
      sub: payload.sub,
      name: payload.name,
      roles: payload.roles ?? [],
      metadata: payload.metadata ?? {}
    };

    const accessToken = this.jwtService.sign(tokenPayload);
    return {
      tokenType: "Bearer",
      accessToken,
      expiresIn: this.configService.get<string>("auth.jwtExpiresIn") ?? "7d"
    };
  }
}
