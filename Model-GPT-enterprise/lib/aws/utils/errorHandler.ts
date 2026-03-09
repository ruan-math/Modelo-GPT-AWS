/**
 * Tratamento centralizado de erros AWS
 */

import { logger } from './logger';

export enum AWSErrorType {
  THROTTLING = 'THROTTLING',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  UNKNOWN = 'UNKNOWN',
}

export interface AWSError {
  type: AWSErrorType;
  message: string;
  statusCode?: number;
  originalError?: Error;
  retryable: boolean;
}

export class AWSErrorHandler {
  static classify(error: any): AWSError {
    const statusCode = error.$metadata?.httpStatusCode || error.statusCode;
    const errorCode = error.code || error.name;
    const message = error.message || 'Unknown error';

    // 429 - Too Many Requests (Throttling)
    if (statusCode === 429 || errorCode === 'ThrottlingException') {
      return {
        type: AWSErrorType.THROTTLING,
        message: 'Rate limit exceeded. Retrying...',
        statusCode,
        originalError: error,
        retryable: true,
      };
    }

    // 400 - Bad Request (Validation)
    if (statusCode === 400 || errorCode?.includes('ValidationException')) {
      return {
        type: AWSErrorType.VALIDATION,
        message: 'Invalid request parameters',
        statusCode,
        originalError: error,
        retryable: false,
      };
    }

    // 404 - Not Found
    if (statusCode === 404) {
      return {
        type: AWSErrorType.NOT_FOUND,
        message: 'Resource not found',
        statusCode,
        originalError: error,
        retryable: false,
      };
    }

    // 401/403 - Unauthorized/Forbidden
    if (statusCode === 401 || statusCode === 403) {
      return {
        type: AWSErrorType.UNAUTHORIZED,
        message: 'Unauthorized access',
        statusCode,
        originalError: error,
        retryable: false,
      };
    }

    // 503 - Service Unavailable
    if (statusCode === 503 || errorCode === 'ServiceUnavailableException') {
      return {
        type: AWSErrorType.SERVICE_UNAVAILABLE,
        message: 'AWS service temporarily unavailable',
        statusCode,
        originalError: error,
        retryable: true,
      };
    }

    return {
      type: AWSErrorType.UNKNOWN,
      message,
      statusCode,
      originalError: error,
      retryable: true,
    };
  }

  static handle(error: any, context: string): AWSError {
    const classified = this.classify(error);
    logger.error(`${context}: ${classified.message}`, error, {
      type: classified.type,
      statusCode: classified.statusCode,
      retryable: classified.retryable,
    });
    return classified;
  }

  static isRetryable(error: any): boolean {
    const classified = this.classify(error);
    return classified.retryable;
  }
}
