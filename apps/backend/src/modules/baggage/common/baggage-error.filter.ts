import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'
import { BAGGAGE_ERROR_CODES, BaggageError, type BaggageErrorCode } from './baggage.errors'

const STATUS_BY_CODE: Record<BaggageErrorCode, HttpStatus> = {
  [BAGGAGE_ERROR_CODES.INVALID_REPORT]: HttpStatus.BAD_REQUEST,
  [BAGGAGE_ERROR_CODES.INVALID_TAG]: HttpStatus.BAD_REQUEST,
  [BAGGAGE_ERROR_CODES.TAG_NOT_ON_BOOKING]: HttpStatus.UNPROCESSABLE_ENTITY,
  [BAGGAGE_ERROR_CODES.REPORT_EXISTS]: HttpStatus.CONFLICT,
  [BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [BAGGAGE_ERROR_CODES.DELIVERY_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [BAGGAGE_ERROR_CODES.CANCELLATION_NOT_ALLOWED]: HttpStatus.CONFLICT,
  [BAGGAGE_ERROR_CODES.INVALID_PHOTO]: HttpStatus.BAD_REQUEST,
  [BAGGAGE_ERROR_CODES.PHOTO_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [BAGGAGE_ERROR_CODES.PHOTO_STORAGE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
}

/** Codes for HTTP errors that carry no F10 code of their own (validation pipe, guards, Nest's built-in exceptions). */
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE',
}

export interface BaggageErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

/**
 * The project-wide error shape `{ error: { code, message, details? } }` (as F2, F7 and aircraft management send it).
 * F10's own codes (BaggageError, FoundBagError) are kept; other HTTP errors get a code from their status, and a
 * validation pipe's list of messages is joined into `message` and kept as `details.problems`.
 */
export function toBaggageErrorBody(error: BaggageError | HttpException): { status: number; body: BaggageErrorBody } {
  if (error instanceof BaggageError) {
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}
    return { status: STATUS_BY_CODE[error.code], body: { error: { code: error.code, message: error.message, ...details } } }
  }

  const status = error.getStatus()
  const fallbackCode = CODE_BY_STATUS[status] ?? (status >= 500 ? 'SERVER_ERROR' : 'ERROR')
  const response = error.getResponse()

  if (typeof response === 'string') {
    return { status, body: { error: { code: fallbackCode, message: response } } }
  }

  const { code, message, ...rest } = response as Record<string, unknown>
  const details: Record<string, unknown> = { ...rest }
  // Nest's own `error` (status name) and `statusCode` repeat the code, so they are not details.
  delete details.error
  delete details.statusCode
  let text: string

  if (Array.isArray(message)) {
    text = message.map(String).join(' ')
    details.problems = message
  } else {
    text = typeof message === 'string' && message ? message : error.message
  }

  return {
    status,
    body: {
      error: {
        code: typeof code === 'string' && code ? code : fallbackCode,
        message: text,
        ...(Object.keys(details).length > 0 ? { details } : {}),
      },
    },
  }
}

/** Applied to every F10 controller. Errors that are not HTTP errors are left to Nest's default 500 handling. */
@Catch(BaggageError, HttpException)
export class BaggageErrorFilter implements ExceptionFilter<BaggageError | HttpException> {
  catch(error: BaggageError | HttpException, host: ArgumentsHost): void {
    const { status, body } = toBaggageErrorBody(error)

    host.switchToHttp().getResponse<Response>().status(status).json(body)
  }
}
