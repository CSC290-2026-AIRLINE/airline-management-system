import { addDays } from './dates'
import { allocateCredits } from './expiry'
import { LedgerRow, TransactionType } from './types'

// Turns ledger rows into the Statement lines both apps show. Pure, so the wording is tested without a database.

// The flight a coupon was on, read through feature 3's booking_coupon.
export interface CouponFlight {
  origin: string
  destination: string
  flightNumber: string
  cabin: string
  fareClassName: string | null
  passengerName: string
  flownBySelf: boolean // the coupon's passenger is the member's own customer.passenger_id
}

export interface StatementSource extends LedgerRow {
  seq: number
  balanceAfter: number
  distanceKm: number | null
  multiplier: string | null
  reason: string | null
  coupon: CouponFlight | null
  // For an expire row, the flight of the credit it expired, so the line can say which miles went.
  expiredFrom: { occurredAt: Date } | null
}

export interface StatementLine {
  seq: number
  type: TransactionType
  miles: number
  balanceAfter: number
  occurredAt: string
  title: string
  detail: string
  bookedForOther: boolean
  expiryNote: string | null
  expiringSoon: boolean
}

const number = new Intl.NumberFormat('en-GB')
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const cabinName = (cabin: string) =>
  cabin
    .split('_')
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
    .join(' ')

function flightTitle(c: CouponFlight, suffix: string) {
  return `${c.origin} → ${c.destination} · ${c.flightNumber} · ${suffix}`
}

function describe(row: StatementSource): { title: string; detail: string } {
  const c = row.coupon
  switch (row.type) {
    case 'earn': {
      const seat = c ? (c.flownBySelf ? 'your seat' : `${c.passengerName}'s seat`) : 'flight'
      const parts = [
        c?.fareClassName && row.multiplier ? `${c.fareClassName} × ${row.multiplier}` : null,
        row.distanceKm ? `${number.format(row.distanceKm)} km` : null,
      ]
      return { title: c ? flightTitle(c, seat) : 'Miles earned', detail: parts.filter(Boolean).join(' · ') }
    }
    case 'redeem':
      return {
        title: c ? flightTitle(c, 'award seat') : 'Award seat',
        detail: c ? `${cabinName(c.cabin)} award seat for ${c.passengerName}` : 'Award seat',
      }
    case 'redeem_reversal':
      return { title: 'Miles returned', detail: 'The award booking expired or was cancelled' }
    case 'expire':
      return {
        title: 'Miles expired',
        detail: row.expiredFrom ? `Earned ${day.format(row.expiredFrom.occurredAt)}` : 'Past the retention period',
      }
    case 'adjust':
      return { title: row.miles > 0 ? 'Miles added by Flython' : 'Miles removed by Flython', detail: row.reason ?? '' }
    default: {
      const unreachable: never = row.type
      return unreachable
    }
  }
}

// Newest first, as both Statement pages list them.
export function statementLines(rows: readonly StatementSource[], now: Date, reminderDays: number): StatementLine[] {
  const remaining = new Map(allocateCredits(rows).map((c) => [c.transactionId, c]))
  const soon = addDays(now, reminderDays)
  return [...rows]
    .sort((a, b) => b.seq - a.seq)
    .map((row) => {
      const credit = remaining.get(row.id)
      let expiryNote: string | null = null
      let expiringSoon = false
      if (credit && credit.remaining > 0 && credit.expiresAt > now) {
        const date = day.format(credit.expiresAt)
        expiryNote = credit.remaining === row.miles ? `Expires ${date}` : `${number.format(credit.remaining)} left · expire ${date}`
        expiringSoon = credit.expiresAt <= soon
      }
      return {
        seq: row.seq,
        type: row.type,
        miles: row.miles,
        balanceAfter: row.balanceAfter,
        occurredAt: row.occurredAt.toISOString(),
        ...describe(row),
        bookedForOther: row.type === 'earn' && row.coupon !== null && !row.coupon.flownBySelf,
        expiryNote,
        expiringSoon,
      }
    })
}

export interface StatementFilter {
  type?: TransactionType
  from?: Date // inclusive
  to?: Date // inclusive, through the end of that day when given as a date
}

export function filterStatement(lines: readonly StatementLine[], filter: StatementFilter): StatementLine[] {
  return lines.filter((line) => {
    const at = new Date(line.occurredAt)
    if (filter.type && line.type !== filter.type) return false
    if (filter.from && at < filter.from) return false
    if (filter.to && at > filter.to) return false
    return true
  })
}
