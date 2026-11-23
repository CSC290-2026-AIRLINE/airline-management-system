import { Badge } from '@staff-web/components/ui/badge'
import { STATUS_BADGE_VARIANTS } from '../payment-copy'
import type { PaymentStatus } from '../types'

/** The payment status, in the words the staff frames use. */
export function PaymentStatusBadge({ status, label }: { status: PaymentStatus; label?: string }) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{label ?? status}</Badge>
}
