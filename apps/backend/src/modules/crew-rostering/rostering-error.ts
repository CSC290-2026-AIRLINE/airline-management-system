import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'

/**
 * Feature 8 errors: `{ error: { code, message, details? } }`, the same shape as the other modules.
 * The code is the contract the UI can switch on; the message is for the operator.
 */
export const RosteringErrorCode = {
  // Business rules named in docs/f8-g01.md, section 9.
  NO_PAIRINGS: 'NO_PAIRINGS',
  PAIRING_IN_USE: 'PAIRING_IN_USE',
  ROSTER_EMPTY: 'ROSTER_EMPTY',
  ROSTER_HAS_BREAKS: 'ROSTER_HAS_BREAKS',
  LAW_RULE_NOT_OVERRIDABLE: 'LAW_RULE_NOT_OVERRIDABLE',
  // Everything else: the code follows the HTTP status.
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  REQUEST_FAILED: 'REQUEST_FAILED',
} as const
export type RosteringErrorCode = (typeof RosteringErrorCode)[keyof typeof RosteringErrorCode]

export interface RosteringErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

/** The body for a named business error. Pass it to a Nest exception: `new ConflictException(rosteringError(...))`. */
export function rosteringError(code: RosteringErrorCode, message: string, details?: Record<string, unknown>): RosteringErrorBody {
  return { error: { code, message, ...(details && { details }) } }
}

const CODE_FOR_STATUS: Record<number, RosteringErrorCode> = {
  [HttpStatus.BAD_REQUEST]: RosteringErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: RosteringErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: RosteringErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: RosteringErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: RosteringErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: RosteringErrorCode.VALIDATION_ERROR,
}

function isErrorBody(value: unknown): value is RosteringErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const { error } = value
  return typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
}

/** Puts any `HttpException` into the error shape. A body that already has the shape passes through untouched. */
export function toRosteringErrorBody(exception: HttpException): RosteringErrorBody {
  const payload = exception.getResponse()
  if (isErrorBody(payload)) return payload

  const code = CODE_FOR_STATUS[exception.getStatus()] ?? RosteringErrorCode.REQUEST_FAILED
  const raw = typeof payload === 'string' ? payload : (payload as { message?: string | string[] }).message
  if (Array.isArray(raw)) return rosteringError(code, raw.join('; '), { messages: raw })
  return rosteringError(code, raw ?? exception.message)
}

/**
 * Bound to the Feature 8 controllers with `@UseFilters`, so the platform's default error shape stays as it is for
 * everyone else. It also covers `StaffOnlyGuard`, whose 401 and 403 are thrown inside the controller's scope.
 */
@Catch(HttpException)
export class RosteringExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(toRosteringErrorBody(exception))
  }
}
