import type { Cabin, PassengerCounts } from '../api/types'

const CABIN_LABELS: Record<Cabin, string> = {
  economy: 'Economy',
  premium_economy: 'Premium economy',
  business: 'Business',
  first: 'First',
}

const TRIP_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const TRIP_DATE_NO_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const FLIGHT_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatCabin(cabin: Cabin): string {
  return CABIN_LABELS[cabin]
}

/** "27 Oct 2026" — the date a booking was made. */
export function formatDateWithYear(iso: string): string {
  return TRIP_DATE.format(new Date(iso))
}

/** "Thu 12 Nov" — the day of a flight, without the comma of formatDate. */
export function formatFlightDate(iso: string): string {
  const parts = FLIGHT_DATE.formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('weekday')} ${value('day')} ${value('month')}`
}

/** "Sat 10 Oct, 09:40" — when the onboard ordering closes. */
export function formatDateTime(iso: string): string {
  return `${formatFlightDate(iso)}, ${formatTime(iso)}`
}

/** "217-4400123456" — the ticket numbers are stored as 13 digits and the hyphen is added here (D11). */
export function formatTicketNumber(ticketNumber: string): string {
  const digits = ticketNumber.replace(/\D/g, '')
  if (digits.length !== 13) {
    return ticketNumber
  }
  return `${digits.slice(0, 3)}-${digits.slice(3)}`
}

/** "12 Nov 2026", or "12 Nov" without the year. */
export function formatTripDate(date: Date, withYear = true): string {
  return (withYear ? TRIP_DATE : TRIP_DATE_NO_YEAR).format(date)
}

/**
 * The dates of a trip: "12 – 19 Nov 2026" for a return trip, "21 Jun 2026" for a single date.
 * The year is left out on the 393 px layout.
 */
export function formatTripDates(start: string | null, end: string | null, withYear = true): string {
  if (!start) {
    return ''
  }

  const from = new Date(start)
  if (!end) {
    return formatTripDate(from, withYear)
  }

  const to = new Date(end)
  if (from.getTime() === to.getTime()) {
    return formatTripDate(from, withYear)
  }

  const sameYear = from.getFullYear() === to.getFullYear()
  const sameMonth = sameYear && from.getMonth() === to.getMonth()

  if (sameMonth) {
    return `${from.getDate()} – ${formatTripDate(to, false)}${withYear ? ` ${to.getFullYear()}` : ''}`
  }

  return `${formatTripDate(from, withYear && !sameYear)} – ${formatTripDate(to, withYear)}`
}

/** "1 adult, 1 child" for the muted line of a booking card. */
export function formatPassengerCounts(counts: PassengerCounts): string {
  const parts: string[] = []

  if (counts.adults > 0) {
    parts.push(`${counts.adults} adult${counts.adults === 1 ? '' : 's'}`)
  }
  if (counts.children > 0) {
    parts.push(`${counts.children} child${counts.children === 1 ? '' : 'ren'}`)
  }
  if (counts.infants > 0) {
    parts.push(`${counts.infants} infant${counts.infants === 1 ? '' : 's'}`)
  }

  return parts.join(', ')
}
