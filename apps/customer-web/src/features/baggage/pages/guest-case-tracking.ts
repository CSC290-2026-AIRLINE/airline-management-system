/** Public guest case tracking (no sign-in). Signed-in customers keep /lost-bag-case. */
export const GUEST_CASE_TRACKING_PATH = '/track-lost-bag'

const CASE_NUMBER_PATTERN = /^LB-\d{4}-\d{6}$/

export const GUEST_TIMELINE_TYPES = [
  'report_received',
  'case_marked_lost',
  'match_confirmed',
  'bag_sent',
  'out_for_delivery',
  'bag_delivered',
  'case_closed',
  'case_cancelled',
] as const

export type GuestTimelineType = (typeof GUEST_TIMELINE_TYPES)[number]

const DELIVERY_STATUSES = ['waiting_choice', 'preparing', 'in_transit', 'ready_for_pickup', 'delivered'] as const
export type GuestDeliveryStatus = (typeof DELIVERY_STATUSES)[number]

/** POST /api/guest/lost-report-case-lookup success body: the read-only guest case view. */
export interface GuestCaseSummary {
  caseNumber: string
  status: string
  reportedAt: string
  lostAt: string | null
  closedAt: string | null
  flight: { flightNumber: string; serviceDate: string; origin: string; destination: string }
  bag: { type: string; colour: string }
  delivery: { status: GuestDeliveryStatus } | null
  timeline: Array<{ type: GuestTimelineType; occurredAt: string }>
}

export interface GuestCaseLookupInput {
  caseNumber: string
  bookingReference: string
  surname: string
}

export function normalizeGuestCaseLookup(input: GuestCaseLookupInput): GuestCaseLookupInput {
  return {
    caseNumber: input.caseNumber.trim().toUpperCase(),
    bookingReference: input.bookingReference.trim().toUpperCase(),
    surname: input.surname.trim(),
  }
}

export function validateGuestCaseLookup(input: GuestCaseLookupInput): Record<string, string> {
  const { caseNumber, bookingReference, surname } = normalizeGuestCaseLookup(input)
  const errors: Record<string, string> = {}
  if (!CASE_NUMBER_PATTERN.test(caseNumber)) errors.caseNumber = 'Enter your case number, for example LB-2026-000121.'
  if (!/^[A-Z0-9]{6}$/.test(bookingReference)) errors.bookingReference = 'Enter a valid six-character booking reference.'
  if (!surname) errors.surname = 'Enter the surname on the booking.'
  else if (surname.length > 100) errors.surname = 'Surname must be 100 characters or fewer.'
  return errors
}

/** Only a well-formed case number may prefill the form from the URL; nothing else is ever taken from it. */
export function prefilledCaseNumber(value: unknown): string {
  if (typeof value !== 'string') return ''
  const caseNumber = value.trim().toUpperCase()
  return CASE_NUMBER_PATTERN.test(caseNumber) ? caseNumber : ''
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'

/** Rebuilds the guest view from the allowlisted fields only; anything else in the body is dropped. Null if malformed. */
export function parseGuestCaseSummary(value: unknown): GuestCaseSummary | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>
  const flight = body.flight as Record<string, unknown> | null | undefined
  const bag = body.bag as Record<string, unknown> | null | undefined
  const delivery = body.delivery as Record<string, unknown> | null | undefined
  if (
    !isString(body.caseNumber) ||
    !isString(body.status) ||
    !isString(body.reportedAt) ||
    !isNullableString(body.lostAt) ||
    !isNullableString(body.closedAt) ||
    !flight ||
    !isString(flight.flightNumber) ||
    !isString(flight.serviceDate) ||
    !isString(flight.origin) ||
    !isString(flight.destination) ||
    !bag ||
    !isString(bag.type) ||
    !isString(bag.colour) ||
    !(delivery === null || (delivery && (DELIVERY_STATUSES as readonly unknown[]).includes(delivery.status))) ||
    !Array.isArray(body.timeline)
  ) {
    return null
  }

  return {
    caseNumber: body.caseNumber,
    status: body.status,
    reportedAt: body.reportedAt,
    lostAt: body.lostAt,
    closedAt: body.closedAt,
    flight: { flightNumber: flight.flightNumber, serviceDate: flight.serviceDate, origin: flight.origin, destination: flight.destination },
    bag: { type: bag.type, colour: bag.colour },
    delivery: delivery ? { status: delivery.status as GuestDeliveryStatus } : null,
    timeline: (body.timeline as unknown[]).flatMap((event) => {
      if (typeof event !== 'object' || event === null) return []
      const { type, occurredAt } = event as Record<string, unknown>
      return (GUEST_TIMELINE_TYPES as readonly unknown[]).includes(type) && isString(occurredAt)
        ? [{ type: type as GuestTimelineType, occurredAt }]
        : []
    }),
  }
}

export function guestTimelineLabel(type: GuestTimelineType): string {
  switch (type) {
    case 'report_received':
      return 'Report received'
    case 'case_marked_lost':
      return 'Case marked lost'
    case 'match_confirmed':
      return 'Staff confirmed a found bag is yours'
    case 'bag_sent':
      return 'Bag sent on its way'
    case 'out_for_delivery':
      return 'Bag out for delivery'
    case 'bag_delivered':
      return 'Bag delivered'
    case 'case_closed':
      return 'Case closed'
    case 'case_cancelled':
      return 'Case cancelled'
  }
}

export function guestDeliveryStatusLabel(status: GuestDeliveryStatus): string {
  const labels: Record<GuestDeliveryStatus, string> = {
    waiting_choice: 'Waiting for arrangements',
    preparing: 'Preparing',
    in_transit: 'In transit',
    ready_for_pickup: 'Ready for pickup',
    delivered: 'Delivered',
  }
  return labels[status]
}

/** The delivery panel for guests: they cannot choose or change delivery online, so it says what to do instead. */
export function guestDeliveryNote(summary: Pick<GuestCaseSummary, 'status' | 'delivery'>): string {
  if (summary.status === 'cancelled') return 'This case was cancelled.'
  if (summary.status === 'closed' || summary.delivery?.status === 'delivered') return 'Your bag is back with you. This case is complete.'
  if (summary.delivery) {
    return 'Staff confirmed a found bag is yours. Contact airline staff with your case number to arrange or change its return.'
  }
  return 'Staff are still searching. If they find your bag, contact airline staff with your case number to arrange its return.'
}
