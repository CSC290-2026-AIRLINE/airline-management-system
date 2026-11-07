import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Service-level codes for found bags, station contacts, staff lost reports, recovery costs, matches and deliveries, sent as
 * `{ code, message }` in the error body. The report codes use the same names as baggage.errors.ts on
 * feat-10-lost-baggage-report.
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
  FLIGHT_NOT_FOUND: 'FLIGHT_NOT_FOUND',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_REPORT: 'INVALID_REPORT',
  TAG_NOT_ON_BOOKING: 'TAG_NOT_ON_BOOKING',
  REPORT_EXISTS: 'REPORT_EXISTS',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  INVALID_COST: 'INVALID_COST',
  COST_NOT_FOUND: 'COST_NOT_FOUND',
  INVALID_MATCH: 'INVALID_MATCH',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  MATCH_EXISTS: 'MATCH_EXISTS',
  MATCH_CLOSED: 'MATCH_CLOSED',
  INVALID_DELIVERY: 'INVALID_DELIVERY',
  DELIVERY_NOT_FOUND: 'DELIVERY_NOT_FOUND',
  ALREADY_SENT: 'ALREADY_SENT',
  OWNERSHIP_NOT_VERIFIED: 'OWNERSHIP_NOT_VERIFIED',
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
  FLIGHT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_STATUS: HttpStatus.CONFLICT,
  INVALID_REPORT: HttpStatus.BAD_REQUEST,
  TAG_NOT_ON_BOOKING: HttpStatus.BAD_REQUEST,
  REPORT_EXISTS: HttpStatus.CONFLICT,
  REPORT_NOT_FOUND: HttpStatus.NOT_FOUND,
  BOOKING_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_COST: HttpStatus.BAD_REQUEST,
  COST_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_MATCH: HttpStatus.BAD_REQUEST,
  MATCH_NOT_FOUND: HttpStatus.NOT_FOUND,
  MATCH_EXISTS: HttpStatus.CONFLICT,
  MATCH_CLOSED: HttpStatus.CONFLICT,
  INVALID_DELIVERY: HttpStatus.BAD_REQUEST,
  DELIVERY_NOT_FOUND: HttpStatus.NOT_FOUND,
  ALREADY_SENT: HttpStatus.CONFLICT,
  OWNERSHIP_NOT_VERIFIED: HttpStatus.CONFLICT,
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
