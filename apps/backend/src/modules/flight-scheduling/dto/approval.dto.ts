import { BadRequestException } from '@nestjs/common'
import { asBody } from './operations.dto'

// Request body for PUT /airports/:iata/approval-policy. Times are local clock times at the airport.

export type OfferStyle = 'window' | 'slots'

export interface ApprovalPolicyInput {
  curfew_start_local: string | null
  curfew_end_local: string | null
  max_departure_per_hour: number | null
  offer_style: OfferStyle
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function parsePolicyBody(raw: unknown): ApprovalPolicyInput {
  const body = asBody(raw)
  const errors: string[] = []

  const time = (key: string): string | null => {
    const v = body[key]
    if (v === undefined || v === null || v === '') return null
    if (typeof v !== 'string' || !HHMM.test(v)) errors.push(`${key} must be HH:MM or null`)
    return typeof v === 'string' ? v : null
  }
  const curfew_start_local = time('curfew_start_local')
  const curfew_end_local = time('curfew_end_local')
  if ((curfew_start_local === null) !== (curfew_end_local === null)) errors.push('send both curfew times or neither')
  if (curfew_start_local !== null && curfew_start_local === curfew_end_local)
    errors.push('curfew_start_local and curfew_end_local must differ')

  const cap = body.max_departure_per_hour ?? null
  if (cap !== null && (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1)) {
    errors.push('max_departure_per_hour must be a positive whole number or null')
  }

  const offer_style = body.offer_style ?? 'slots'
  if (offer_style !== 'window' && offer_style !== 'slots') errors.push('offer_style must be window or slots')

  if (errors.length) throw new BadRequestException(errors)
  return { curfew_start_local, curfew_end_local, max_departure_per_hour: cap as number | null, offer_style: offer_style as OfferStyle }
}
