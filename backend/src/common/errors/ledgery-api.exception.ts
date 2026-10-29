import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from './api-error-code.enum';

export class LedgeryApiException extends HttpException {
  public readonly code: ApiErrorCode;
  public readonly details?: any;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: any,
  ) {
    const errorResponse = {
      statusCode,
      code,
      message,
      error: LedgeryApiException.getStatusText(statusCode),
      details,
    };
    super(errorResponse, statusCode);
    this.code = code;
    this.details = details;
  }

  private static getStatusText(status: HttpStatus): string {
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
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too Many Requests';
      default:
        return 'Internal Server Error';
    }
  }
}

