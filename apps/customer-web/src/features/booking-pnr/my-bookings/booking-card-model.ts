import { airportCity } from '../../booking-search/components/airports'
import type { BookingListItem } from '../api/types'
import type { ChipTone } from '../components/StatusChip'

export type TripTab = 'upcoming' | 'past'

export type CardActionKind = 'complete-payment' | 'add-meals' | 'report-problem' | 'view-receipt' | 'none'

export interface CardAction {
  kind: CardActionKind
  label: string
  // Why the action cannot be used yet. Null when the action works.
  disabledReason: string | null
}

export interface CardModel {
  chip: { label: string; tone: ChipTone }
  // The 393 px card shows the countdown on its own line, so its chip stays short.
  mobileChip: { label: string; tone: ChipTone }
  action: CardAction
  // The last line of the 393 px card: "Tickets issued", "Expires in 03:12", …
  mobileNote: string
}

const MEALS_DISABLED = 'Meals (feature 12) are not connected yet.'
const COMPLAINT_DISABLED = 'Complaints (feature 13) are not connected yet.'
const RECEIPT_DISABLED = 'Refunds (feature 5b) are not connected yet.'

// Meals close 48 hours before departure.
const MEALS_CUTOFF_MS = 48 * 60 * 60 * 1000

const NO_ACTION: CardAction = { kind: 'none', label: '', disabledReason: null }

/**
 * The chip of a booking card. A held booking shows the countdown; the other chips show the status only.
 * A booking that flew keeps its 'confirmed' status, so the Past tab shows it as completed.
 */
function chipFor(item: BookingListItem, tab: TripTab, countdown: string | null, expired: boolean): CardModel['chip'] {
  if (expired) {
    return { label: 'Expired', tone: 'expired' }
  }

  switch (item.status) {
    case 'held':
      return { label: countdown ? `Held · expires in ${countdown}` : 'Held', tone: 'held' }
    case 'confirmed':
      return tab === 'past' ? { label: 'Completed', tone: 'completed' } : { label: 'Confirmed', tone: 'confirmed' }
    case 'cancelled':
      return { label: 'Cancelled · refunded', tone: 'cancelled' }
    case 'expired':
      return { label: 'Expired', tone: 'expired' }
    default: {
      const unreachable: never = item.status
      return unreachable
    }
  }
}

/** The link under the "View trip" button of a booking card. */
function actionFor(item: BookingListItem, tab: TripTab, expired: boolean, serverNow: string): CardAction {
  if (expired) {
    return NO_ACTION
  }

  if (item.status === 'held') {
    return { kind: 'complete-payment', label: 'Complete payment', disabledReason: null }
  }

  if (item.status === 'confirmed') {
    if (tab === 'past') {
      return { kind: 'report-problem', label: 'Report a problem', disabledReason: COMPLAINT_DISABLED }
    }
    // Meals close 48 hours before departure (B11).
    if (!mealsStillOpen(item, serverNow)) {
      return NO_ACTION
    }
    return { kind: 'add-meals', label: 'Add meals', disabledReason: MEALS_DISABLED }
  }

  if (item.status === 'cancelled') {
    return { kind: 'view-receipt', label: 'View receipt', disabledReason: RECEIPT_DISABLED }
  }

  return { kind: 'report-problem', label: 'Report a problem', disabledReason: COMPLAINT_DISABLED }
}

/** Meals can be added until 48 hours before departure. */
function mealsStillOpen(item: BookingListItem, serverNow: string): boolean {
  if (!item.travelDate) {
    return true
  }
  return Date.parse(item.travelDate) - Date.parse(serverNow) > MEALS_CUTOFF_MS
}

/** The last line of the 393 px card. */
function mobileNoteFor(item: BookingListItem, tab: TripTab, countdown: string | null, expired: boolean): string {
  if (expired) {
    return 'Hold expired'
  }
  if (item.status === 'held') {
    return countdown ? `Expires in ${countdown}` : 'Hold active'
  }
  if (item.status === 'confirmed') {
    return tab === 'past' ? 'Flown' : 'Tickets issued'
  }
  if (item.status === 'cancelled') {
    return 'Cancelled'
  }
  return 'Hold expired'
}

/** Everything a booking card shows: the chip, the action under "View trip" and the note of the 393 px card. */
export function cardModel(item: BookingListItem, tab: TripTab, countdown: string | null, expired: boolean, serverNow: string): CardModel {
  const chip = chipFor(item, tab, countdown, expired)

  return {
    chip,
    mobileChip: chip.tone === 'held' ? { label: 'Held', tone: chip.tone } : chip,
    action: actionFor(item, tab, expired, serverNow),
    mobileNote: mobileNoteFor(item, tab, countdown, expired),
  }
}

/** The flights of a booking: "FL311" for one flight, "2 flights" for a return trip. */
export function flightLabel(item: BookingListItem): string {
  if (item.flightNumbers.length > 1) {
    return `${item.flightCount} flights`
  }
  return item.flightNumbers[0] ?? ''
}

// The airport codes of a trip label, e.g. "BKK ⇄ HKT".
const IATA_CODE = /^[A-Z]{3}$/

/**
 * The route of a card: "Bangkok ⇄ Phuket" for a return trip, "Bangkok → Chiang Mai" for a one-way trip.
 * The API sends the airport codes, the customer sees the city names.
 */
export function routeLabel(trip: string): string {
  return trip
    .split(' ')
    .map((part) => (IATA_CODE.test(part) ? airportCity(part) : part))
    .join(' ')
}
