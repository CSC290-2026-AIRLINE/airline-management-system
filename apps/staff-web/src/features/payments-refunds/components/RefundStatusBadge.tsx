import { Badge } from '@staff-web/components/ui/badge'
import type { RefundStatus } from '../types'

/** The badge variant of each state. The words come from the API (`status_label`); only the variant is decided here. */
function variant(status: RefundStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'requested':
    case 'pending_approval':
      return 'secondary'
    case 'approved':
    case 'processing':
      return 'outline'
    case 'succeeded':
      return 'default'
    case 'failed':
    case 'rejected':
      return 'destructive'
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

export function RefundStatusBadge({ status, label }: { status: RefundStatus; label: string }) {
  return <Badge variant={variant(status)}>{label}</Badge>
}
