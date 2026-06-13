import { ConflictException, Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { hash, compare } from "bcryptjs";
import { DatabaseService } from "../infra/database.service.js";
import type { LoginDto, RegisterDto } from "./auth.dto.js";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly db: DatabaseService
  ) {}

  async onModuleInit() {
    await this.seedDefaultUser();
  }

  async register(dto: RegisterDto) {
    const prisma = this.db.getPrisma();
    const existing = await prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException("用户名已存在");
    }

    const passwordHash = await hash(dto.password, 10);
    const user = await prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        displayName: dto.displayName ?? dto.username
      }
    });

    return this.issueToken(user.id, user.displayName ?? user.username);
  }

  async login(dto: LoginDto) {
    const prisma = this.db.getPrisma();
    const user = await prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) {
      throw new UnauthorizedException("用户名或密码错误");
    }

    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("用户名或密码错误");
    }

    return this.issueToken(user.id, user.displayName ?? user.username);
  }

  async seedDefaultUser() {
    const username = this.configService.get<string>("auth.defaultUsername");
    const password = this.configService.get<string>("auth.defaultPassword");
    if (!username || !password) return;

    const prisma = this.db.getPrisma();
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return;

    const passwordHash = await hash(password, 10);
    await prisma.user.create({
      data: { username, passwordHash, displayName: username }
    });
  }

  private issueToken(sub: string, name: string) {
    const accessToken = this.jwtService.sign({ sub, name });
    return {
      tokenType: "Bearer" as const,
      accessToken,
      expiresIn: this.configService.get<string>("auth.jwtExpiresIn") ?? "7d",
      user: { sub, name }
    };
  }
}
