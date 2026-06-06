import { HttpStatus } from "@nestjs/common";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "AUTH_UNAUTHORIZED"
  | "AUTH_FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR";

export function statusToErrorCode(status: number, isValidationError = false): ErrorCode {
  if (isValidationError) return "VALIDATION_ERROR";

  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "AUTH_UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "AUTH_FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "RESOURCE_NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "TOO_MANY_REQUESTS";
    default:
      return "INTERNAL_ERROR";
  }
}
