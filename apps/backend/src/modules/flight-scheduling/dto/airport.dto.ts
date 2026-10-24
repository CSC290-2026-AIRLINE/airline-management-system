import { BadRequestException } from '@nestjs/common'

export interface ListAirportsQueryDto {
  q?: string // matches IATA, ICAO, name or city (case-insensitive)
  country?: string
  is_active?: string // 'true' | 'false'
  cursor?: string // iata_code of the last airport on the previous page
  limit?: string
}

export interface AirportInput {
  iata_code?: string
  icao_code: string
  name: string
  city: string
  country: string
  timezone: string
  min_turnaround_min: number
  is_active?: boolean
}

const IATA = /^[A-Z]{3}$/
const ICAO = /^[A-Z]{4}$/
// The DB check airport_country_check and Feature 7's nationality use the same format, so Feature 8 can compare them.
const COUNTRY = /^[a-z]{2}$/

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function parseIata(raw: string): string {
  const iata = raw.trim().toUpperCase()
  if (!IATA.test(iata)) throw new BadRequestException('iata_code must be 3 letters')
  return iata
}

// iata_code is required on create; on update it comes from the path and a body value must match it.
export function parseAirportBody(body: unknown, requireIata: boolean): AirportInput {
  if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
  const errors: string[] = []

  const text = (key: string) => {
    const v = body[key]
    if (typeof v !== 'string' || !v.trim()) {
      errors.push(`${key} is required`)
      return ''
    }
    return v.trim()
  }

  const iata = body.iata_code === undefined && !requireIata ? undefined : text('iata_code').toUpperCase()
  if (iata !== undefined && iata && !IATA.test(iata)) errors.push('iata_code must be 3 letters')
  const icao = text('icao_code').toUpperCase()
  if (icao && !ICAO.test(icao)) errors.push('icao_code must be 4 letters')
  const country = text('country')
  if (country && !COUNTRY.test(country)) errors.push('country must be a 2-letter lower-case code, such as th or jp')
  const timezone = text('timezone')
  if (timezone && !isTimezone(timezone)) errors.push('timezone must be an IANA time zone name')

  const min = body.min_turnaround_min
  if (typeof min !== 'number' || !Number.isInteger(min) || min < 1) errors.push('min_turnaround_min must be a positive integer')
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') errors.push('is_active must be a boolean')

  const result: AirportInput = {
    iata_code: iata,
    icao_code: icao,
    name: text('name'),
    city: text('city'),
    country,
    timezone,
    min_turnaround_min: min as number,
    is_active: body.is_active as boolean | undefined,
  }
  if (errors.length) throw new BadRequestException(errors)
  return result
}
