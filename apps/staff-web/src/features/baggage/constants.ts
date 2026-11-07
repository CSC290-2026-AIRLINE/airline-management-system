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
