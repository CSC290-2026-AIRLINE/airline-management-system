import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'
import { BAGGAGE_ERROR_CODES, BaggageError, type BaggageErrorCode } from './baggage.errors'

const STATUS_BY_CODE: Record<BaggageErrorCode, HttpStatus> = {
  [BAGGAGE_ERROR_CODES.INVALID_REPORT]: HttpStatus.BAD_REQUEST,
  [BAGGAGE_ERROR_CODES.INVALID_TAG]: HttpStatus.BAD_REQUEST,
  [BAGGAGE_ERROR_CODES.TAG_NOT_ON_BOOKING]: HttpStatus.BAD_REQUEST,
  [BAGGAGE_ERROR_CODES.REPORT_EXISTS]: HttpStatus.CONFLICT,
  [BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [BAGGAGE_ERROR_CODES.DELIVERY_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [BAGGAGE_ERROR_CODES.CANCELLATION_NOT_ALLOWED]: HttpStatus.CONFLICT,
  [BAGGAGE_ERROR_CODES.INVALID_PHOTO]: HttpStatus.BAD_REQUEST,
  [BAGGAGE_ERROR_CODES.PHOTO_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [BAGGAGE_ERROR_CODES.PHOTO_STORAGE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
}

@Catch(BaggageError)
export class BaggageErrorFilter implements ExceptionFilter<BaggageError> {
  catch(error: BaggageError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    response.status(STATUS_BY_CODE[error.code]).json({
      code: error.code,
      message: error.message,
    })
  }
}
