import { Body, Controller, Get, Post } from "@nestjs/common";
import { Public } from "./public.decorator.js";
import { AuthService } from "./auth.service.js";
import { RegisterDto, LoginDto } from "./auth.dto.js";

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get("public-key")
  getPublicKey() {
    return { publicKey: this.authService.getPublicKeyPem() };
  }

  @Public()
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
