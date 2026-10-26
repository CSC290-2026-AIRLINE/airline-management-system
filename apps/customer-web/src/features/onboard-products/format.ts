// Locale-aware formatters. Centralised so a future locale switch is a
// one-line change. Per customer-web/CLAUDE.md, prefer Intl.* over
// hand-rolled formatting.

import type { PassengerRef, ProductOrderLine } from './types'

// en-GB matches the Figma copy ("Mon 12 Oct", "09:40").
const DATE_LONG = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const TIME_24H = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDate(iso: string): string {
  return DATE_LONG.format(new Date(iso))
}

export function formatTime(iso: string): string {
  return TIME_24H.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return `${DATE_LONG.format(new Date(iso))}, ${TIME_24H.format(new Date(iso))}`
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function capitalise(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Per-line subtitle as shown under the product name on the order card:
//   meal       → "Meal for Somchai"
//   duty_free  → line.fulfillmentNote ?? "Collect on board"
//   snack / bev→ "3 × $4.00" when qty > 1, else "$4.00"
export function formatLineSubtitle(line: ProductOrderLine, passengers: PassengerRef[], currency: string): string {
  if (line.category === 'meal' && line.passengerId) {
    const p = passengers.find((x) => x.id === line.passengerId)
    if (p) return `Meal for ${p.firstName}`
  }
  if (line.category === 'duty_free') {
    return line.fulfillmentNote ?? 'Collect on board'
  }
  if (line.quantity > 1) {
    return `${line.quantity} × ${formatMoney(line.unitPrice, currency)}`
  }
  return formatMoney(line.unitPrice, currency)
}

// The order-window default from the spec. Used as a fallback when the API
// response does not include a per-flight `cutoffAt`.
export const DEFAULT_ORDER_WINDOW_HOURS = 48

export function defaultCutoffFor(scheduledDepartureIso: string): string {
  const dep = new Date(scheduledDepartureIso)
  return new Date(dep.getTime() - DEFAULT_ORDER_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
}

// Countdown string used in the page-2 banner: "in 2 d 1 h", "in 5 h 23 m",
// "in 12 m", "in 45 s". Two largest units only.
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '0 m'
  const totalMinutes = Math.floor(msRemaining / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} m`
  return `${minutes} m`
}
