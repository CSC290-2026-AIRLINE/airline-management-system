import { BadRequestException } from '@nestjs/common'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export function parseLimit(raw: string | undefined): number {
  const limit = raw === undefined ? DEFAULT_LIMIT : Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new BadRequestException(`limit must be an integer from 1 to ${MAX_LIMIT}`)
  }
  return limit
}

// Prisma error codes are duck-typed so unit tests need not load the generated client.
export const prismaCode = (e: unknown) => (e as { code?: string } | null)?.code
