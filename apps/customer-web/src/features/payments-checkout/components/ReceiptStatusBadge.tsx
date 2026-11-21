import { Badge } from '@customer-web/components/ui/badge'
import { RECEIPT_STATUS_BADGE_CLASSES, RECEIPT_STATUS_LABELS, STATUS_BADGE_CLASSES, STATUS_LABELS } from '../receipt-copy'
import type { PaymentStatus, ReceiptStatus } from '../types'

/** The payment status, in the customer's words. */
export function ReceiptStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={STATUS_BADGE_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
}

/**
 * The receipt's state, in the customer's words: "Paid", "Miles + cash" or "Flown".
 *
 * The frames show this in the list rather than the payment's raw status, because it is the only thing a customer can
 * act on.
 */
export function ReceiptStateBadge({ status }: { status: ReceiptStatus }) {
  return <Badge className={RECEIPT_STATUS_BADGE_CLASSES[status]}>{RECEIPT_STATUS_LABELS[status]}</Badge>
}
