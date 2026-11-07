export const AIRPORT_CODE_PATTERN = /^[A-Z]{3}$/

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Prisma error codes, checked by value so callers never need the generated client at runtime. */
export function prismaErrorCode(e: unknown): string | undefined {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined
  return typeof code === 'string' ? code : undefined
}
