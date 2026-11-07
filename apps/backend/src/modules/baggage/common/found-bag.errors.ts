import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Service-level codes for found bags, sent as `{ code, message }` in the error body.
 * Fold into baggage.errors.ts once feat-10-lost-baggage-report is in dev.
 */
export const FOUND_BAG_ERROR_CODES = {
  INVALID_FOUND_BAG: 'INVALID_FOUND_BAG',
  INVALID_TAG: 'INVALID_TAG',
  FOUND_BAG_EXISTS: 'FOUND_BAG_EXISTS',
  FOUND_BAG_NOT_FOUND: 'FOUND_BAG_NOT_FOUND',
  INVALID_MOVE: 'INVALID_MOVE',
  BAG_CLOSED: 'BAG_CLOSED',
} as const

export type FoundBagErrorCode = (typeof FOUND_BAG_ERROR_CODES)[keyof typeof FOUND_BAG_ERROR_CODES]

const STATUS_BY_CODE: Record<FoundBagErrorCode, HttpStatus> = {
  INVALID_FOUND_BAG: HttpStatus.BAD_REQUEST,
  INVALID_TAG: HttpStatus.BAD_REQUEST,
  FOUND_BAG_EXISTS: HttpStatus.CONFLICT,
  FOUND_BAG_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_MOVE: HttpStatus.CONFLICT,
  BAG_CLOSED: HttpStatus.CONFLICT,
}

export class FoundBagError extends HttpException {
  constructor(
    public readonly code: FoundBagErrorCode,
    message: string,
  ) {
    super({ code, message }, STATUS_BY_CODE[code])
    this.name = 'FoundBagError'
  }
}
