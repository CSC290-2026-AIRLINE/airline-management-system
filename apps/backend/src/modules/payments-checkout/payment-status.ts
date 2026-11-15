import type { PaymentRecord, PaymentStatus } from './payment.types'

/**
 * The one place where a stored payment status becomes a screen state.
 *
 * The database status set (`created | authorised | captured | failed | voided | expired | reversed`) is not the same
 * vocabulary the screens use: the customer frames show "Confirming your booking" for an authorised payment and
 * "Confirming payment" for a capture that is stalling, and the staff lookup filters on "capture stalled" and
 * "refunded", which are not statuses at all. Everything that turns a row into a screen state goes through this file,
 * so a rename is one edit here and one edit in each frontend's copy of the same list.
 */

/** The customer-facing states of the payment result page, from the Figma frames. */
export const CUSTOMER_PAYMENT_STATES = ['authorised', 'captured', 'confirming', 'failed', 'expired', 'refunded'] as const
export type CustomerPaymentState = (typeof CUSTOMER_PAYMENT_STATES)[number]

/**
 * The staff lookup's status filters, from the Figma frames. These are screen labels, not database statuses:
 * `capture_stalled` is `capture_stalled_at IS NOT NULL` and `refunded` is the `reversed` status.
 */
export const STAFF_PAYMENT_FILTERS = ['captured', 'failed', 'capture_stalled', 'voided', 'refunded'] as const
export type StaffPaymentFilter = (typeof STAFF_PAYMENT_FILTERS)[number]

/**
 * The customer's receipts list filters, from the Figma frames.
 *
 * The frames' chips are "All receipts", "Flights", "Miles + cash", "Cargo" and "With credit note" — they cut across
 * the receipt's status, so they are not the same vocabulary as `ReceiptStatus`.
 */
export const RECEIPT_FILTERS = ['all', 'flights', 'miles_and_cash', 'cargo', 'credit_note'] as const
export type ReceiptFilter = (typeof RECEIPT_FILTERS)[number]

/**
 * The customer state for one payment.
 *
 * - `created` is still waiting for the customer to pay on the provider's page → "Confirming your booking".
 * - `authorised` without a stall → "Confirming your booking" as well; the seller has not confirmed yet.
 * - `authorised` with a stall → "Confirming payment", the "taking longer than usual, we keep retrying" state.
 * - `captured` → paid. `failed` → the card was declined. `expired` → the hold ran out before a payment was made.
 * - `voided` → the authorisation was released without a charge, which the customer sees as the expired copy.
 * - `reversed` → refunded in full (Feature 5b owns the refund, 5a only reflects the state).
 */
export function toCustomerState(payment: Pick<PaymentRecord, 'status' | 'capture_stalled_at'>): CustomerPaymentState {
  if (payment.status === 'captured') return 'captured'
  if (payment.status === 'failed') return 'failed'
  if (payment.status === 'reversed') return 'refunded'
  if (payment.status === 'expired' || payment.status === 'voided') return 'expired'
  if (payment.status === 'authorised') return payment.capture_stalled_at ? 'confirming' : 'authorised'
  return 'authorised'
}

/** True when the payment's status filter label matches. `capture_stalled` is a flag, not a status. */
export function matchesStaffFilter(payment: Pick<PaymentRecord, 'status' | 'capture_stalled_at'>, filter: StaffPaymentFilter): boolean {
  if (filter === 'capture_stalled') return payment.capture_stalled_at !== null
  if (filter === 'refunded') return payment.status === 'reversed'
  return payment.status === filter
}

/** The staff filter label for a payment, or `null` when the payment matches none of the frames' filters. */
export function staffFilterFor(payment: Pick<PaymentRecord, 'status' | 'capture_stalled_at'>): StaffPaymentFilter | null {
  const match = STAFF_PAYMENT_FILTERS.find((filter) => matchesStaffFilter(payment, filter))
  return match ?? null
}

/** The staff label for a stored status, used where the frames show the status itself rather than a filter. */
export const STATUS_LABELS: Record<PaymentStatus, string> = {
  created: 'Created',
  authorised: 'Authorised',
  captured: 'Captured',
  failed: 'Failed',
  voided: 'Voided',
  expired: 'Expired',
  reversed: 'Refunded',
}

/**
 * The label a purchase's source feature carries on the screens.
 *
 * TODO(F5a): Feature 6 is called "Excess baggage" here, but `staff-web`'s `feature-labels.ts` (Feature 15's folder)
 * calls 6 "CHECK-IN". The frames win over the labels, so this is a question for the Dev Leads.
 */
export const SOURCE_FEATURE_LABELS: Record<PaymentRecord['source_feature'], string> = {
  3: 'Flight booking',
  6: 'Excess baggage',
  12: 'Onboard sale',
  17: 'Cargo',
}

/**
 * The human-readable payment reference the staff frames show, e.g. `PAY-20261104-0042`.
 *
 * The schema has no column for it — `receipt.document_number` is the only human-readable number the database keeps —
 * so the mock derives one from the payment's own id and start date.
 *
 * TODO(F5a): the Database Team adds `payment.reference` (unique) and this becomes a column read.
 */
export function paymentReference(payment: Pick<PaymentRecord, 'id' | 'started_at'>): string {
  const day = payment.started_at.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = payment.id
    .replace(/[^0-9A-Za-z]/g, '')
    .slice(-4)
    .toUpperCase()
  return `PAY-${day}-${suffix}`
}

/** One step of the state history the staff payment detail shows. */
export interface PaymentStateStep {
  /** A stable key for the step, so a frontend can key its list without matching on the label. */
  key: 'created' | 'authorised' | 'confirmed' | 'stalled' | 'captured' | 'reversed' | 'failed' | 'voided' | 'expired'
  label: string
  /** When it happened, or `null` when the step has not happened. */
  at: Date | null
}

/**
 * The state history of one payment, in the order the frames show it.
 *
 * Only the steps that actually happened are listed, so a stalled capture ends at "capture stalled" and a captured
 * payment ends at "captured". The labels are the frames' own words.
 *
 * TODO(F5a): the real implementation reads a `payment_event` table. `payment_event_receipt` is not it — that table
 * exists to deduplicate webhook deliveries, not to keep a timeline.
 */
export function stateHistoryFor(
  payment: Pick<
    PaymentRecord,
    | 'status'
    | 'started_at'
    | 'authorised_at'
    | 'confirmed_at'
    | 'capture_stalled_at'
    | 'captured_at'
    | 'voided_at'
    | 'expires_at'
    | 'updated_at'
  >,
): PaymentStateStep[] {
  const steps: PaymentStateStep[] = [{ key: 'created', label: 'created', at: payment.started_at }]
  if (payment.authorised_at) steps.push({ key: 'authorised', label: 'authorised', at: payment.authorised_at })
  if (payment.confirmed_at) steps.push({ key: 'confirmed', label: 'booking confirmed', at: payment.confirmed_at })
  if (payment.capture_stalled_at) steps.push({ key: 'stalled', label: 'capture stalled', at: payment.capture_stalled_at })
  if (payment.captured_at) steps.push({ key: 'captured', label: 'captured', at: payment.captured_at })
  // The schema keeps no refund time on the payment; it moved to `reversed` when it was last written.
  if (payment.status === 'reversed') steps.push({ key: 'reversed', label: 'refunded', at: payment.updated_at })
  if (payment.status === 'failed') steps.push({ key: 'failed', label: 'card declined', at: payment.updated_at })
  if (payment.voided_at) steps.push({ key: 'voided', label: 'authorisation released', at: payment.voided_at })
  if (payment.status === 'expired') steps.push({ key: 'expired', label: 'hold expired', at: payment.expires_at })
  return steps
}
