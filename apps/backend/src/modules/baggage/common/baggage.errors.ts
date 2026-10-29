/**
 * TAG_NOT_ON_BOOKING and REPORT_EXISTS follow the F10 schema review.
 * Other error codes are provisional service-level decisions.
 */
export const BAGGAGE_ERROR_CODES = {
  INVALID_REPORT: 'INVALID_REPORT',
  INVALID_TAG: 'INVALID_TAG',
  TAG_NOT_ON_BOOKING: 'TAG_NOT_ON_BOOKING',
  REPORT_EXISTS: 'REPORT_EXISTS',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
} as const

export type BaggageErrorCode = (typeof BAGGAGE_ERROR_CODES)[keyof typeof BAGGAGE_ERROR_CODES]

export class BaggageError extends Error {
  constructor(
    public readonly code: BaggageErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BaggageError'
  }
}
