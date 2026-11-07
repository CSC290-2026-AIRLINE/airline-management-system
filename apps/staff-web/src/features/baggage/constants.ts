/**
 * Lists and labels for the Feature 10 staff screens. The value lists mirror the backend's
 * (`apps/backend/src/modules/baggage/common/*`), which follow the CHECKs on found_bag and bag_location_event.
 */

export const BAG_TYPES = ['suitcase', 'backpack', 'duffel', 'box', 'garment_bag', 'sports_equipment', 'stroller', 'other'] as const
export type BagType = (typeof BAG_TYPES)[number]

export const BAG_COLOURS = [
  'black',
  'white',
  'grey',
  'blue',
  'red',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
  'brown',
  'beige',
  'multi',
] as const
export type BagColour = (typeof BAG_COLOURS)[number]

export const FOUND_BAG_STATUSES = ['held', 'matched', 'sent', 'delivered', 'unclaimed', 'continued_with_flight'] as const
export type FoundBagStatus = (typeof FOUND_BAG_STATUSES)[number]

/** What staff record by hand; the other actions are written by intake, the diversion job and the delivery flow. */
export const STAFF_MOVE_ACTIONS = ['held', 'sent', 'arrived'] as const
export type StaffMoveAction = (typeof STAFF_MOVE_ACTIONS)[number]

export const BAG_TYPE_LABELS: Record<BagType, string> = {
  suitcase: 'Suitcase',
  backpack: 'Backpack',
  duffel: 'Duffel bag',
  box: 'Box',
  garment_bag: 'Garment bag',
  sports_equipment: 'Sports equipment',
  stroller: 'Stroller',
  other: 'Other',
}

export function colourLabel(colour: BagColour): string {
  return colour === 'multi' ? 'Multicolour' : colour.charAt(0).toUpperCase() + colour.slice(1)
}

export const STATUS_LABELS: Record<FoundBagStatus, string> = {
  held: 'Held',
  matched: 'Matched',
  sent: 'Sent',
  delivered: 'Delivered',
  unclaimed: 'Unclaimed',
  continued_with_flight: 'Went on with flight',
}

export const MOVE_LABELS: Record<StaffMoveAction, string> = {
  held: 'Held',
  sent: 'Sent',
  arrived: 'Arrived',
}

/** Pill colours from the "F10 / Pill" component in Figma. */
export type PillTone = 'amber' | 'grey' | 'red' | 'green'

export const STATUS_TONES: Record<FoundBagStatus, PillTone> = {
  held: 'amber',
  matched: 'green',
  sent: 'grey',
  delivered: 'green',
  unclaimed: 'red',
  continued_with_flight: 'grey',
}

/**
 * Airports to offer when no station contact is saved yet: Feature 2's seeded network. found_airport and
 * bag_location_event.airport_code are foreign keys to the airport table, so other codes would be refused.
 */
export const FALLBACK_AIRPORTS: { code: string; name: string }[] = [
  { code: 'BKK', name: 'Suvarnabhumi' },
  { code: 'CNX', name: 'Chiang Mai' },
  { code: 'HKT', name: 'Phuket' },
]

/** 0, the airline code 789, then 6 digits (Feature 6). Same rule as the backend's BAGGAGE_TAG_PATTERN. */
export const BAGGAGE_TAG_PATTERN = /^0\d{9}$/

/**
 * Short reference for a found bag. found_bag has no case number column yet, so this is the start of the UUID; the Figma
 * "FB-0414" style needs a sequence from the Database Team.
 */
export function bagRef(id: string): string {
  return `FB-${id.slice(0, 4).toUpperCase()}`
}

/** "Blue suitcase · Rimowa", or the diverted-flight placeholder when staff have not checked the bag yet. */
export function bagSummary(bag: { bagType: BagType | null; colour: BagColour | null; brand: string | null }): string {
  if (!bag.bagType || !bag.colour) return 'Type and colour not checked yet'
  const main = `${colourLabel(bag.colour)} ${BAG_TYPE_LABELS[bag.bagType].toLowerCase()}`
  return bag.brand ? `${main} · ${bag.brand}` : main
}

const EVENT_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

/** "20 Oct 07:20" */
export function formatEventTime(iso: string): string {
  return EVENT_TIME.format(new Date(iso)).replace(',', '')
}

/** Same list as the CHECK on lost_bag_report.status. */
export const REPORT_STATUSES = ['open', 'matched', 'delivering', 'lost', 'closed', 'cancelled'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Open',
  matched: 'Matched',
  delivering: 'Being delivered',
  lost: 'Lost',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export const REPORT_STATUS_TONES: Record<ReportStatus, PillTone> = {
  open: 'amber',
  matched: 'green',
  delivering: 'grey',
  lost: 'red',
  closed: 'grey',
  cancelled: 'grey',
}

/** The "Status" chips on Lost bag cases. Active is every case still being worked on. */
export const CASE_FILTERS = ['active', 'open', 'lost', 'closed', 'all'] as const
export type CaseFilter = (typeof CASE_FILTERS)[number]

export const CASE_FILTER_LABELS: Record<CaseFilter, string> = {
  active: 'Active',
  open: 'Open',
  lost: 'Lost',
  closed: 'Closed',
  all: 'All',
}

export const CASE_FILTER_STATUSES: Record<CaseFilter, readonly ReportStatus[]> = {
  active: ['open', 'matched', 'delivering'],
  open: ['open'],
  lost: ['lost'],
  closed: ['closed', 'cancelled'],
  all: REPORT_STATUSES,
}

/** Same list as the CHECK on bag_cost.kind. */
export const BAG_COST_KINDS = ['forwarding', 'delivery', 'storage', 'other'] as const
export type BagCostKind = (typeof BAG_COST_KINDS)[number]

export const BAG_COST_KIND_LABELS: Record<BagCostKind, string> = {
  forwarding: 'Forwarding',
  delivery: 'Delivery',
  storage: 'Storage',
  other: 'Other',
}

/** "LB-2026-000118" → "000118", the short number the Cases table shows. */
export function caseShortNumber(caseNumber: string): string {
  return caseNumber.split('-').pop() ?? caseNumber
}

/** How long ago a case was reported, as the Cases table shows it: "2 d", "5 h", "12 min". */
export function caseAge(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`
}

const FLIGHT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "18 Oct". Flight dates are calendar dates, so they are read in UTC to keep the day the same in every time zone. */
export function formatFlightDate(iso: string): string {
  return FLIGHT_DAY.format(new Date(iso))
}

/** "FY 204 · BKK to HKT · 20 Oct" */
export function flightLabel(flight: { flightNumber: string; origin: string; destination: string; serviceDate: string }): string {
  return `${flight.flightNumber} · ${flight.origin} to ${flight.destination} · ${formatFlightDate(flight.serviceDate)}`
}

const BAHT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** "฿1,850", or "฿12.50" when there are satang. */
export function formatBaht(amount: string | number): string {
  const n = Number(amount)
  return `฿${Number.isInteger(n) ? BAHT.format(n) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Same lists as the CHECKs on bag_match, and the backend's match reasons. */
export const MATCH_LEVELS = ['strong', 'possible', 'manual'] as const
export type MatchLevel = (typeof MATCH_LEVELS)[number]

export const MATCH_STATUSES = ['suggested', 'under_review', 'confirmed', 'rejected'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]

export type MatchReason = 'same_tag' | 'owner_tag' | 'same_flight' | 'same_type' | 'same_colour' | 'same_brand' | 'similar_description'

export const MATCH_LEVEL_LABELS: Record<MatchLevel, string> = {
  strong: 'Strong',
  possible: 'Possible',
  manual: 'Linked by staff',
}

export const MATCH_LEVEL_TONES: Record<MatchLevel, PillTone> = {
  strong: 'green',
  possible: 'amber',
  manual: 'grey',
}

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  suggested: 'Suggested',
  under_review: 'Under review',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
}

export const MATCH_STATUS_TONES: Record<MatchStatus, PillTone> = {
  suggested: 'amber',
  under_review: 'amber',
  confirmed: 'green',
  rejected: 'red',
}

/** A match that staff can still confirm or reject. */
export function isOpenMatch(status: MatchStatus): boolean {
  return status === 'suggested' || status === 'under_review'
}

/** "Strong · same tag", "Possible · same flight": the level with the strongest reason behind it. */
export function matchLevelText(level: MatchLevel, reasons: readonly MatchReason[]): string {
  const why = reasons.includes('same_tag')
    ? 'same tag'
    : reasons.includes('owner_tag')
      ? 'tag on booking'
      : reasons.includes('same_flight')
        ? 'same flight'
        : null
  return level !== 'manual' && why ? `${MATCH_LEVEL_LABELS[level]} · ${why}` : MATCH_LEVEL_LABELS[level]
}

/** Short reference for a match. bag_match has no number column, so this is the start of the UUID, like `bagRef`. */
export function matchRef(id: string): string {
  return `M-${id.slice(0, 4).toUpperCase()}`
}

/** Same lists as the CHECKs on bag_delivery. */
export const DELIVERY_TYPES = ['home', 'hotel', 'other_address', 'airport_pickup'] as const
export type DeliveryType = (typeof DELIVERY_TYPES)[number]

export const DELIVERY_STATUSES = ['waiting_choice', 'preparing', 'in_transit', 'ready_for_pickup', 'delivered'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  home: 'Home',
  hotel: 'Hotel',
  other_address: 'Other address',
  airport_pickup: 'Airport pickup',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  waiting_choice: 'Waiting for passenger',
  preparing: 'Preparing',
  in_transit: 'In transit',
  ready_for_pickup: 'Ready for pickup',
  delivered: 'Delivered',
}

export const DELIVERY_STATUS_TONES: Record<DeliveryStatus, PillTone> = {
  waiting_choice: 'amber',
  preparing: 'amber',
  in_transit: 'grey',
  ready_for_pickup: 'green',
  delivered: 'green',
}

/** The "Status" chips on Deliveries. Active is every delivery not handed over yet. */
export const DELIVERY_FILTERS = ['active', 'delivered', 'all'] as const
export type DeliveryFilter = (typeof DELIVERY_FILTERS)[number]

export const DELIVERY_FILTER_LABELS: Record<DeliveryFilter, string> = {
  active: 'Active',
  delivered: 'Delivered',
  all: 'All',
}

/** "Hotel: Hotel Gracery Shinjuku, Tokyo", "Pickup at NRT", or null while the passenger has not chosen. */
export function deliveryDestination(d: {
  deliveryType: DeliveryType | null
  address: string | null
  pickupAirport: string | null
}): string | null {
  if (!d.deliveryType) return null
  if (d.deliveryType === 'airport_pickup') return `Pickup at ${d.pickupAirport ?? '–'}`
  return `${DELIVERY_TYPE_LABELS[d.deliveryType]}: ${d.address ?? '–'}`
}

/** Identity documents accepted at handover, and who can collect a bag. Same lists as the backend's. */
export const ID_DOCUMENT_TYPES = ['passport', 'national_id', 'driving_licence'] as const
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]

export const ID_DOCUMENT_LABELS: Record<IdDocumentType, string> = {
  passport: 'Passport',
  national_id: 'National ID card',
  driving_licence: 'Driving licence',
}

export const COLLECTORS = ['passenger', 'representative'] as const
export type Collector = (typeof COLLECTORS)[number]

export const COLLECTOR_LABELS: Record<Collector, string> = {
  passenger: 'Passenger',
  representative: 'Someone sent by the passenger',
}

export type OwnershipMismatch = 'booking_reference' | 'last_name' | 'document_number'

export const OWNERSHIP_MISMATCH_LABELS: Record<OwnershipMismatch, string> = {
  booking_reference: 'Booking reference',
  last_name: 'Surname',
  document_number: 'Passport number',
}

/** What the baggage desk is told about (the backend's StaffNotificationKind). */
export type StaffNotificationKind = 'strong_match' | 'new_report' | 'delivery_to_send' | 'unclaimed_soon' | 'bag_unclaimed' | 'case_lost'

export const NOTIFICATION_TITLES: Record<StaffNotificationKind, string> = {
  strong_match: 'Strong match to review',
  new_report: 'New lost bag report',
  delivery_to_send: 'Bag ready to send',
  unclaimed_soon: 'Bag turns unclaimed soon',
  bag_unclaimed: 'Bag marked unclaimed',
  case_lost: 'Case declared lost',
}
