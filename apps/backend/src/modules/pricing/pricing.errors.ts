export const PricingErrorCode = {
  FARE_CLASS_NOT_FOUND: 'FARE_CLASS_NOT_FOUND',
  FARE_CLASS_CODE_TAKEN: 'FARE_CLASS_CODE_TAKEN',
  CURRENCY_RATE_NOT_FOUND: 'CURRENCY_RATE_NOT_FOUND',
  CURRENCY_CODE_TAKEN: 'CURRENCY_CODE_TAKEN',
  CURRENCY_IS_BASE: 'CURRENCY_IS_BASE',
  STAFF_NOT_FOUND: 'STAFF_NOT_FOUND',
} as const
export type PricingErrorCode = (typeof PricingErrorCode)[keyof typeof PricingErrorCode]

// Body for every pricing error: { code, message, details? }. Pass it to a Nest exception, e.g.
// throw new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, '...'))
export function pricingError(code: PricingErrorCode, message: string, details?: Record<string, unknown>) {
  return { code, message, ...(details && { details }) }
}

// Prisma P2002 = unique constraint violated. Checked by code rather than `instanceof Prisma.PrismaClientKnownRequestError`
// so services do not load the generated Prisma runtime, which Jest cannot resolve.
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'P2002'
}
