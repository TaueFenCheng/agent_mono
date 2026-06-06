import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface SuccessResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class SuccessResponseInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: "ok",
        data
      }))
    );
  }
}
