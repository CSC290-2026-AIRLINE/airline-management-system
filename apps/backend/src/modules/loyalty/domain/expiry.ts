import { addDays, utcDateKey } from './dates'
import { LedgerRow } from './types'

export interface CreditState {
  transactionId: string
  expiresAt: Date
  remaining: number // what debits and earlier expiries have not taken
}

export interface ExpireRowDraft {
  expiredTransactionId: string
  miles: number // negative, exactly what is left of the credit
}

export interface ExpiryReminder {
  expiresOn: string // YYYY-MM-DD
  miles: number
}

// Row 14. Credits are earn rows and positive adjustments, each less any expire row that points at it. Debits are redeem
// rows without a reversal and negative adjustments. Debits use up the credits with the earliest expires_at first.
export function allocateCredits(rows: readonly LedgerRow[]): CreditState[] {
  const expiredBy = new Map<string, number>()
  const reversed = new Set<string>()
  for (const row of rows) {
    if (row.type === 'expire' && row.expiredTransactionId) {
      expiredBy.set(row.expiredTransactionId, (expiredBy.get(row.expiredTransactionId) ?? 0) - row.miles)
    }
    if (row.type === 'redeem_reversal' && row.reversedTransactionId) reversed.add(row.reversedTransactionId)
  }

  const credits: CreditState[] = rows
    .filter((r) => (r.type === 'earn' || (r.type === 'adjust' && r.miles > 0)) && r.expiresAt)
    .map((r) => ({ transactionId: r.id, expiresAt: r.expiresAt as Date, remaining: r.miles - (expiredBy.get(r.id) ?? 0) }))
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.transactionId.localeCompare(b.transactionId))

  let debit = 0
  for (const row of rows) {
    if (row.type === 'redeem' && !reversed.has(row.id)) debit -= row.miles
    if (row.type === 'adjust' && row.miles < 0) debit -= row.miles
  }

  for (const credit of credits) {
    if (debit <= 0) break
    const used = Math.min(credit.remaining, debit)
    credit.remaining -= used
    debit -= used
  }
  return credits
}

// One expire row per credit past its expires_at with miles left, for exactly that amount.
export function draftExpiries(rows: readonly LedgerRow[], now: Date): ExpireRowDraft[] {
  return allocateCredits(rows)
    .filter((c) => c.expiresAt <= now && c.remaining > 0)
    .map((c) => ({ expiredTransactionId: c.transactionId, miles: -c.remaining }))
}

// One reminder per expiry date within the reminder window, with the total for that date. Feature 13's inbound_event
// key miles_expiring:<member id>:<date> makes a repeat a no-op, so nothing is recorded here.
export function expiryReminders(rows: readonly LedgerRow[], now: Date, reminderDays: number): ExpiryReminder[] {
  const until = addDays(now, reminderDays)
  const byDate = new Map<string, number>()
  for (const credit of allocateCredits(rows)) {
    if (credit.remaining <= 0 || credit.expiresAt <= now || credit.expiresAt > until) continue
    const key = utcDateKey(credit.expiresAt)
    byDate.set(key, (byDate.get(key) ?? 0) + credit.remaining)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([expiresOn, miles]) => ({ expiresOn, miles }))
}

export function reminderEventId(memberId: string, expiresOn: string): string {
  return `miles_expiring:${memberId}:${expiresOn}`
}
