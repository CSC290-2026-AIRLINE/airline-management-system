// Lounge desk rules (F11 doc, Tier benefits → Lounge). Pure, so the order of the checks is tested without a database.

/** A ticket qualifies when its flight departs within this many hours of now (simulation clock). */
export const LOUNGE_WINDOW_HOURS = 4

export type LoungeRefusal = 'no_tier' | 'no_ticket' | 'too_many_guests' | 'already_visited'

export interface LoungeCheck {
  loungeGuests: number | null // the tier's allowance; null = no lounge access (or no tier at all)
  hasTicket: boolean // a confirmed coupon on a flight departing within the window
  guests: number
  alreadyVisited: boolean // a lounge_visit row for this member and flight
}

/** The first rule that fails, in the order the desk explains it: tier, ticket, guests, then one visit per flight. */
export function loungeRefusal(c: LoungeCheck): LoungeRefusal | null {
  if (c.loungeGuests === null) return 'no_tier'
  if (!c.hasTicket) return 'no_ticket'
  if (c.guests > c.loungeGuests) return 'too_many_guests'
  if (c.alreadyVisited) return 'already_visited'
  return null
}

/** Member numbers are `FL` and 8 digits; anything else typed at the desk is read as a booking reference. */
export const MEMBER_NUMBER = /^FL\d{8}$/

export function normaliseDeskQuery(query: string): { kind: 'member'; memberNumber: string } | { kind: 'booking'; reference: string } {
  const key = query.trim().toUpperCase().replace(/\s+/g, '')
  return MEMBER_NUMBER.test(key) ? { kind: 'member', memberNumber: key } : { kind: 'booking', reference: key }
}
