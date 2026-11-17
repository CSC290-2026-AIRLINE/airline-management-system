/**
 * Prisma errors are matched by their `code` instead of by `instanceof`, so the service boundary keeps
 * working with the ESM-only generated client (which Jest cannot load) and with any driver adapter.
 */
export function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

export const PRISMA_UNIQUE_VIOLATION = 'P2002'
export const PRISMA_RECORD_NOT_FOUND = 'P2025'
export const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003'
