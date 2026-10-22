import { BadRequestException } from '@nestjs/common'

export interface ListRoutesQueryDto {
  origin?: string // IATA
  destination?: string // IATA
  is_active?: string // 'true' | 'false'
  cursor?: string // id of the last route on the previous page
  limit?: string
}

export interface RouteInput {
  origin: string
  destination: string
  distance_km: number
  block_time_min: number
  is_active?: boolean
}

const IATA = /^[A-Za-z]{3}$/

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseRouteBody(body: unknown): RouteInput {
  if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
  const errors: string[] = []

  const code = (key: 'origin' | 'destination') => {
    const v = body[key]
    if (typeof v !== 'string' || !IATA.test(v.trim())) {
      errors.push(`${key} must be a 3-letter IATA code`)
      return ''
    }
    return v.trim().toUpperCase()
  }
  const positiveInt = (key: 'distance_km' | 'block_time_min') => {
    const v = body[key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
      errors.push(`${key} must be a positive integer`)
      return 0
    }
    return v
  }

  const origin = code('origin')
  const destination = code('destination')
  if (origin && origin === destination) errors.push('origin and destination must differ')
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') errors.push('is_active must be a boolean')

  const result: RouteInput = {
    origin,
    destination,
    distance_km: positiveInt('distance_km'),
    block_time_min: positiveInt('block_time_min'),
    is_active: body.is_active as boolean | undefined,
  }
  if (errors.length) throw new BadRequestException(errors)
  return result
}
