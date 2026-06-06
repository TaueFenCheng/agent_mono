import { Body, Controller, Headers, Post } from "@nestjs/common";
import { Public } from "./public.decorator.js";
import { AuthService } from "./auth.service.js";
import { CreateTokenDto } from "./auth.dto.js";

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("token")
  createToken(@Body() payload: CreateTokenDto, @Headers("x-bootstrap-key") bootstrapKey?: string) {
    return this.authService.createAccessToken(payload, bootstrapKey);
  }
}
