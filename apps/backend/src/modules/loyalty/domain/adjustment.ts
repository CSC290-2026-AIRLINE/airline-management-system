import { addMonths } from './dates'

export interface AdjustmentDraft {
  miles: number
  reason: string
  expiresAt: Date | null // set on positive adjustments only, like the ledger's CHECK
}

export type AdjustmentRefusal = 'zero_miles' | 'not_integer' | 'blank_reason' | 'below_zero'

// A staff adjustment. Positive miles expire like earned miles; a negative adjustment may not take the balance below 0
// (the database refuses it too, but this gives the staff page a clear message).
export function draftAdjustment(input: {
  miles: number
  reason: string
  balance: number
  now: Date
  retentionMonths: number
}): { draft: AdjustmentDraft } | { refusal: AdjustmentRefusal } {
  if (!Number.isInteger(input.miles)) return { refusal: 'not_integer' }
  if (input.miles === 0) return { refusal: 'zero_miles' }
  const reason = input.reason.trim()
  if (reason === '') return { refusal: 'blank_reason' }
  if (input.balance + input.miles < 0) return { refusal: 'below_zero' }
  return {
    draft: { miles: input.miles, reason, expiresAt: input.miles > 0 ? addMonths(input.now, input.retentionMonths) : null },
  }
}

// Expiry date of an earn row: retention counts from the flight, not from when the job ran.
export function earnExpiresAt(occurredAt: Date, retentionMonths: number): Date {
  return addMonths(occurredAt, retentionMonths)
}
