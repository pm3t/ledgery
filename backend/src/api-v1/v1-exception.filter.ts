import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { ApiErrorCode } from '../common/errors/api-error-code.enum';
import { LedgeryApiException } from '../common/errors/ledgery-api.exception';

@Catch()
export class V1ExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Generate or read request_id
    const incomingRequestId =
      (request.headers['x-request-id'] as string) ||
      (request.headers['X-Request-Id'] as string);
    const requestId =
      incomingRequestId || crypto.randomBytes(4).toString('hex');

    response.setHeader('X-Request-Id', requestId);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiErrorCode = ApiErrorCode.INTERNAL_ERROR;
    let message = 'Terjadi kesalahan internal pada server.';
    let error = 'Internal Server Error';
    let details: any = undefined;

    if (exception instanceof LedgeryApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
      error = this.getStatusText(status);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = this.getStatusText(status);
      const res: any = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        message = Array.isArray(res.message)
          ? res.message.join('; ')
          : res.message || exception.message;

        // Validation pipe errors (array of messages)
        if (Array.isArray(res.message)) {
          code = ApiErrorCode.VALIDATION_ERROR;
          details = { errors: res.message };
        } else if (res.errorCode) {
          code = this.mapErrorCode(res.errorCode, status);
          details = res.details;
        } else {
          code = this.mapStatusToCode(status);
        }
      } else if (typeof res === 'string') {
        message = res;
        code = this.mapStatusToCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorBody = {
      statusCode: status,
      code,
      message,
      error,
      ...(details !== undefined ? { details } : {}),
      request_id: requestId,
    };

    response.status(status).json(errorBody);
  }

  private mapErrorCode(errorCode: string, status: number): ApiErrorCode {
    switch (errorCode) {
      case 'UNBALANCED_JOURNAL':
        return ApiErrorCode.UNBALANCED_JOURNAL;
      case 'PERIOD_CLOSED':
        return ApiErrorCode.PERIOD_CLOSED;
      case 'PERIOD_NOT_FOUND':
        return ApiErrorCode.PERIOD_CLOSED;
      case 'ACCOUNT_NOT_FOUND':
        return ApiErrorCode.ACCOUNT_NOT_FOUND;
      case 'ACCOUNT_INACTIVE':
      case 'CONTROL_ACCOUNT_MANUAL_POSTING_BLOCKED':
        return ApiErrorCode.ACCOUNT_INACTIVE;
      case 'DIMENSION_NOT_FOUND':
      case 'DIMENSION_VALUE_NOT_FOUND':
        return ApiErrorCode.DIMENSION_VALUE_NOT_FOUND;
      case 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH':
      case 'IDEMPOTENCY_CONFLICT':
        return ApiErrorCode.IDEMPOTENCY_CONFLICT;
      default:
        return this.mapStatusToCode(status);
    }
  }

  private mapStatusToCode(status: number): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.INVALID_API_KEY;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.IDEMPOTENCY_CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ApiErrorCode.RATE_LIMITED;
      default:
        return ApiErrorCode.INTERNAL_ERROR;
    }
  }

  private getStatusText(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too Many Requests';
      default:
        return 'Internal Server Error';
    }
  }
}

