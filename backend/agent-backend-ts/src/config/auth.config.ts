import { registerAs } from "@nestjs/config";

export default registerAs("auth", () => ({
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  defaultUsername: process.env.AUTH_DEFAULT_USERNAME ?? "",
  defaultPassword: process.env.AUTH_DEFAULT_PASSWORD ?? ""
}));
