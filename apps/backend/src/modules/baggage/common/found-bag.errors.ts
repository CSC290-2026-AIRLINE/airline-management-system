/**
 * Provisional service-level codes for found bags.
 * Fold into baggage.errors.ts once feat-10-lost-baggage-report is in dev.
 */
export const FOUND_BAG_ERROR_CODES = {
  INVALID_FOUND_BAG: 'INVALID_FOUND_BAG',
  INVALID_TAG: 'INVALID_TAG',
  FOUND_BAG_EXISTS: 'FOUND_BAG_EXISTS',
  FOUND_BAG_NOT_FOUND: 'FOUND_BAG_NOT_FOUND',
} as const

export type FoundBagErrorCode = (typeof FOUND_BAG_ERROR_CODES)[keyof typeof FOUND_BAG_ERROR_CODES]

export class FoundBagError extends Error {
  constructor(
    public readonly code: FoundBagErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'FoundBagError'
  }
}
