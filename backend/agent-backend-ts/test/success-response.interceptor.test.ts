import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { of, firstValueFrom } from "rxjs";
import { GlobalExceptionFilter } from "../src/common/filters/global-exception.filter";
import { SuccessResponseInterceptor } from "../src/common/interceptors/success-response.interceptor";

describe("SuccessResponseInterceptor", () => {
  it("wraps successful payloads with code message data", async () => {
    const interceptor = new SuccessResponseInterceptor<{ ok: boolean }>();

    const result = await firstValueFrom(
      interceptor.intercept({} as any, {
        handle: () => of({ ok: true })
      })
    );

    expect(result).toEqual({
      code: 0,
      message: "ok",
      data: { ok: true }
    });
  });
});

describe("GlobalExceptionFilter", () => {
  it("wraps failed payloads with code message data", () => {
    const filter = new GlobalExceptionFilter();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const setHeader = vi.fn();

    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          url: "/health",
          method: "GET"
        }),
        getResponse: () => ({
          setHeader,
          status
        })
      })
    } as ArgumentsHost;

    filter.catch(
      new HttpException(
        {
          message: "bad request",
          code: "INVALID_REQUEST"
        },
        HttpStatus.BAD_REQUEST
      ),
      host
    );

    expect(setHeader).toHaveBeenCalledWith("x-request-id", expect.any(String));
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "bad request",
        data: null,
        details: expect.objectContaining({
          statusCode: 400,
          path: "/health",
          method: "GET"
        })
      })
    );
  });
});
