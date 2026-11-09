import { Badge } from '@customer-web/components/ui/badge'
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from '../receipt-copy'
import type { PaymentStatus } from '../types'

/** The payment status, in the customer's words. */
export function ReceiptStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={STATUS_BADGE_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
}
