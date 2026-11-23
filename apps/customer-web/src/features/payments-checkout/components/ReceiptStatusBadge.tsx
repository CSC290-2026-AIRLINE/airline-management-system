import { Badge } from '@customer-web/components/ui/badge'
import { RECEIPT_STATUS_BADGE_VARIANTS, RECEIPT_STATUS_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../receipt-copy'
import type { PaymentStatus, ReceiptStatus } from '../types'

/** The payment status, in the customer's words. */
export function ReceiptStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
}

/** The receipt's state, in the customer's words: "Paid", "Miles + cash" or "Flown". */
export function ReceiptStateBadge({ status }: { status: ReceiptStatus }) {
  return <Badge variant={RECEIPT_STATUS_BADGE_VARIANTS[status]}>{RECEIPT_STATUS_LABELS[status]}</Badge>
}
