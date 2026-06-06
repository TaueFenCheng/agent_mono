import { registerAs } from "@nestjs/config";

export default registerAs("auth", () => ({
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  bootstrapKey: process.env.AUTH_BOOTSTRAP_KEY ?? ""
}));
