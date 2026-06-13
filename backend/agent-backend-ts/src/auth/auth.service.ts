import { ConflictException, Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, compare } from "bcryptjs";
import * as crypto from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { DatabaseService } from "../infra/database.service.js";
import type { LoginDto, RegisterDto } from "./auth.dto.js";

const ENV_DEFAULT_USERNAME = process.env.AUTH_DEFAULT_USERNAME ?? "";
const ENV_DEFAULT_PASSWORD = process.env.AUTH_DEFAULT_PASSWORD ?? "";
const ENV_JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

@Injectable()
export class AuthService implements OnModuleInit {
  private privateKey: string;
  private publicKey: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly db: DatabaseService
  ) {
    const keysDir = resolve(process.cwd(), "keys");
    const privateKeyPath = resolve(keysDir, "private.pem");
    const publicKeyPath = resolve(keysDir, "public.pem");

    if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
      this.privateKey = readFileSync(privateKeyPath, "utf-8");
      this.publicKey = readFileSync(publicKeyPath, "utf-8");
    } else {
      const keyPair = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
      });
      this.privateKey = keyPair.privateKey;
      this.publicKey = keyPair.publicKey;
      mkdirSync(keysDir, { recursive: true });
      writeFileSync(privateKeyPath, this.privateKey, "utf-8");
      writeFileSync(publicKeyPath, this.publicKey, "utf-8");
    }
  }

  async onModuleInit() {
    await this.seedDefaultUser();
  }

  getPublicKeyPem(): string {
    return this.publicKey;
  }

  decryptPassword(encryptedBase64: string): string {
    const buffer = crypto.privateDecrypt(
      {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      },
      Buffer.from(encryptedBase64, "base64")
    );
    return buffer.toString("utf-8");
  }

  async register(dto: RegisterDto) {
    const prisma = this.db.getPrisma();
    const existing = await prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException("用户名已存在");
    }

    const password: string = dto.encryptedPassword
      ? this.decryptPassword(dto.encryptedPassword)
      : (dto.password as string);
    const passwordHash = await hash(password, 10);
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

    const password: string = dto.encryptedPassword
      ? this.decryptPassword(dto.encryptedPassword)
      : (dto.password as string);
    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("用户名或密码错误");
    }

    return this.issueToken(user.id, user.displayName ?? user.username);
  }

  async seedDefaultUser() {
    if (!ENV_DEFAULT_USERNAME || !ENV_DEFAULT_PASSWORD) return;

    const prisma = this.db.getPrisma();
    const existing = await prisma.user.findUnique({ where: { username: ENV_DEFAULT_USERNAME } });
    if (existing) return;

    const passwordHash = await hash(ENV_DEFAULT_PASSWORD, 10);
    await prisma.user.create({
      data: { username: ENV_DEFAULT_USERNAME, passwordHash, displayName: ENV_DEFAULT_USERNAME }
    });
  }

  private issueToken(sub: string, name: string) {
    const accessToken = this.jwtService.sign({ sub, name });
    return {
      tokenType: "Bearer" as const,
      accessToken,
      expiresIn: ENV_JWT_EXPIRES_IN,
      user: { sub, name }
    };
  }
}
