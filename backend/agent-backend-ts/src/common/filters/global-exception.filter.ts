import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { statusToErrorCode, type ErrorCode } from "../errors/error-codes.js";

type HttpExceptionPayload = string | { message?: string | string[]; error?: string; code?: string; details?: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function inferValidationError(status: number, payload: HttpExceptionPayload): boolean {
  if (status !== HttpStatus.BAD_REQUEST) return false;
  if (typeof payload === "string") return false;
  if (Array.isArray(payload?.message)) return true;
  if (payload?.error === "Bad Request") return true;
  return false;
}

function normalizeMessage(status: number, payload: HttpExceptionPayload, fallbackMessage: string): string {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload?.message) && payload.message.length > 0) {
    return payload.message.join("; ");
  }
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  if (status === HttpStatus.INTERNAL_SERVER_ERROR) return "Internal server error";
  return fallbackMessage;
}

function normalizeDetails(payload: HttpExceptionPayload): unknown {
  if (typeof payload === "string") return undefined;
  if (Array.isArray(payload?.message)) {
    return { validation: payload.message };
  }
  if (isObject(payload?.details)) return payload.details;
  if (isObject(payload)) {
    const details = { ...payload };
    delete details.message;
    delete details.error;
    delete details.code;
    if (Object.keys(details).length > 0) return details;
  }
  return undefined;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{
      headers: Record<string, string | string[] | undefined>;
      url: string;
      method: string;
    }>();
    const response = ctx.getResponse<{
      setHeader: (name: string, value: string) => void;
      status: (statusCode: number) => { json: (body: unknown) => void };
    }>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = (exception instanceof HttpException ? exception.getResponse() : undefined) as HttpExceptionPayload | undefined;
    const isValidationError = inferValidationError(status, payload ?? "");

    const fallbackMessage = exception instanceof Error ? exception.message : "Unexpected error";
    const message = normalizeMessage(status, payload ?? "", fallbackMessage);
    const details = normalizeDetails(payload ?? "");

    let code: ErrorCode = statusToErrorCode(status, isValidationError);
    if (payload && typeof payload !== "string" && typeof payload.code === "string" && payload.code.trim()) {
      code = payload.code as ErrorCode;
    }

    const requestIdHeader = request.headers["x-request-id"];
    const requestId =
      (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader) || randomUUID();
    response.setHeader("x-request-id", requestId);

    const responseBody = {
      code,
      message,
      data: null,
      details: {
        details,
        statusCode: status,
        path: request.url,
        method: request.method,
        requestId,
        timestamp: new Date().toISOString()
      }
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`[${request.method}] ${request.url} -> ${status} ${code}: ${message}`, stack);
    } else {
      this.logger.warn(`[${request.method}] ${request.url} -> ${status} ${code}: ${message}`);
    }

    response.status(status).json(responseBody);
  }
}
