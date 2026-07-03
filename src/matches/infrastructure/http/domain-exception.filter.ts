import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import {
  DomainError,
  InvalidRoundError,
  InvalidTransitionError,
  MatchFullError,
  MatchNotFoundError,
  MoveNotAllowedError,
  MoveNotFoundError,
  OptimisticLockError,
  PlayerAlreadyJoinedError,
  PlayerNotInMatchError,
} from '../../domain/errors';

/**
 * Translates pure domain errors to HTTP responses. This keeps the domain free of
 * NestJS imports: the HTTP boundary is the responsibility of the infrastructure layer.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('DomainException');

  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.statusFor(error);

    if (status >= 500) {
      this.logger.error(error.message, error.stack);
    }

    response.status(status).json({
      statusCode: status,
      error: error.name,
      message: error.message,
    });
  }

  private statusFor(error: DomainError): number {
    if (error instanceof MatchNotFoundError || error instanceof MoveNotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (
      error instanceof InvalidTransitionError ||
      error instanceof MatchFullError ||
      error instanceof PlayerAlreadyJoinedError ||
      error instanceof MoveNotAllowedError ||
      error instanceof OptimisticLockError ||
      error instanceof PlayerNotInMatchError ||
      error instanceof InvalidRoundError
    ) {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
}
