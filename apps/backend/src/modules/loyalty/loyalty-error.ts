import { HttpException, HttpStatus } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'

export type LoyaltyErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_A_CUSTOMER'
  | 'NOT_A_MEMBER'
  | 'ALREADY_A_MEMBER'
  | 'MEMBER_NOT_FOUND'
  | 'TIER_NOT_FOUND'
  | 'FARE_CLASS_NOT_FOUND'
  | 'SETTING_NOT_FOUND'
  | 'INSUFFICIENT_MILES'
  | 'LOYALTY_ROLE_REQUIRED'
  | 'JOB_NOT_FOUND'
  | 'JOB_NOT_AVAILABLE'
  | 'JOB_RUNNING'
  | 'FLIGHT_NOT_FOUND'
  | 'BOOKING_NOT_FOUND'
  | 'NOT_A_MILES_BOOKING'
  | 'AWARD_CABIN_NOT_FOUND'
  | 'AWARD_ALREADY_RELEASED'
  | 'AWARD_NOT_RELEASED'
  | 'AWARD_CLOSED'
  | 'AWARD_BELOW_TAKEN'
  | 'AWARD_SEATS_UNAVAILABLE'

/** Every Feature 11 error has the shape `{ error: { code, message, details? } }`, which both loyalty apps read. */
export class LoyaltyError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: LoyaltyErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, ...(details ? { details } : {}) } }, status)
  }
}

export const invalid = (field: string, message: string) =>
  new LoyaltyError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, { fields: { [field]: [message] } })

export const notAMember = () => new LoyaltyError(HttpStatus.NOT_FOUND, 'NOT_A_MEMBER', 'You have not joined Flython Miles yet.')

export const memberNotFound = () => new LoyaltyError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'No member with that id.')

/** class-validator failures as `VALIDATION_FAILED`, with the messages per field. */
export function toLoyaltyValidationError(errors: ValidationError[]): LoyaltyError {
  const fields = Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]))
  return new LoyaltyError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Some fields are missing or invalid.', { fields })
}

/**
 * True when PostgreSQL refused a write on a CHECK constraint (SQLSTATE 23514), e.g. `loyalty_member.miles_balance >= 0`
 * when two spends race. The pg adapter reports it as a Prisma known error whose cause carries the original code.
 */
export function isCheckViolation(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const e = current as { code?: unknown; originalCode?: unknown; message?: unknown; meta?: unknown; cause?: unknown }
    if (e.code === '23514' || e.originalCode === '23514') return true
    if (typeof e.message === 'string' && /check constraint|miles_balance/i.test(e.message)) return true
    current = e.cause ?? (e.meta as { driverAdapterError?: unknown } | undefined)?.driverAdapterError
  }
  return false
}

/** True for Prisma's unique-violation code. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}
