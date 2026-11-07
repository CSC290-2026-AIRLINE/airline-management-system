import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Service-level codes for found bags and station contacts, sent as `{ code, message }` in the error body.
 * Fold into baggage.errors.ts once feat-10-lost-baggage-report is in dev.
 */
export const FOUND_BAG_ERROR_CODES = {
  INVALID_FOUND_BAG: 'INVALID_FOUND_BAG',
  INVALID_TAG: 'INVALID_TAG',
  FOUND_BAG_EXISTS: 'FOUND_BAG_EXISTS',
  FOUND_BAG_NOT_FOUND: 'FOUND_BAG_NOT_FOUND',
  INVALID_MOVE: 'INVALID_MOVE',
  BAG_CLOSED: 'BAG_CLOSED',
  INVALID_STATION_CONTACT: 'INVALID_STATION_CONTACT',
  STATION_CONTACT_NOT_FOUND: 'STATION_CONTACT_NOT_FOUND',
  FLIGHT_NOT_DIVERTED: 'FLIGHT_NOT_DIVERTED',
  INVALID_STATUS: 'INVALID_STATUS',
} as const

export type FoundBagErrorCode = (typeof FOUND_BAG_ERROR_CODES)[keyof typeof FOUND_BAG_ERROR_CODES]

const STATUS_BY_CODE: Record<FoundBagErrorCode, HttpStatus> = {
  INVALID_FOUND_BAG: HttpStatus.BAD_REQUEST,
  INVALID_TAG: HttpStatus.BAD_REQUEST,
  FOUND_BAG_EXISTS: HttpStatus.CONFLICT,
  FOUND_BAG_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_MOVE: HttpStatus.CONFLICT,
  BAG_CLOSED: HttpStatus.CONFLICT,
  INVALID_STATION_CONTACT: HttpStatus.BAD_REQUEST,
  STATION_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  FLIGHT_NOT_DIVERTED: HttpStatus.CONFLICT,
  INVALID_STATUS: HttpStatus.CONFLICT,
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
