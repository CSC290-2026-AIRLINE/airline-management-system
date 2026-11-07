export const BOOKING_ERROR_CODES = [
  'SEAT_UNAVAILABLE',
  'PRICE_CHANGED',
  'HOLD_EXPIRED_REFUNDED',
  'ASSISTANCE_TOO_LATE',
  'SEAT_NOT_ALLOWED',
  'BOOKING_CLOSED',
  'FLIGHT_NOT_FOR_SALE',
  'INVALID_BOOKING_STATE',
] as const

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number]

export interface BookingErrorDetails {
  [key: string]: unknown
}

export class BookingError extends Error {
  readonly code: BookingErrorCode
  readonly status: number
  readonly details?: BookingErrorDetails

  constructor(code: BookingErrorCode, message: string, status = 409, details?: BookingErrorDetails) {
    super(message)
    this.name = 'BookingError'
    this.code = code
    this.status = status
    this.details = details
  }
}
