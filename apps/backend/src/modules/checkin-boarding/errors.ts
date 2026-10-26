import { HttpException } from '@nestjs/common'
import type { ApiError } from './api-types'

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'WINDOW_CLOSED'
  | 'NOT_ELIGIBLE'
  | 'MRZ_INVALID'
  | 'PASSPORT_EXPIRING'
  | 'VISA_REQUIRED'
  | 'DUPLICATE_DOCUMENT'
  | 'ON_HOLD'
  | 'SEAT_TAKEN'
  | 'LOCK_EXPIRED'
  | 'EXCESS_UNPAID'
  | 'BAG_REFUSED'
  | 'INVALID_STATE'
  | 'HEADCOUNT_MISMATCH'

export class CheckInError extends HttpException {
  readonly code: ErrorCode

  constructor(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const body: ApiError = { error: { code, message } }
    if (details) {
      body.error.details = details
    }
    super(body, status)
    this.code = code
  }
}

export const notFound = (what: string) => new CheckInError(404, 'NOT_FOUND', `${what} not found`)
export const validation = (message: string, details?: Record<string, unknown>) => new CheckInError(400, 'VALIDATION', message, details)
export const invalidState = (message: string) => new CheckInError(409, 'INVALID_STATE', message)
