import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import type { RefundStatus } from '../types'

/** The colour of each state. The words come from the API (`status_label`); only the colour is decided here. */
function tone(status: RefundStatus): string {
  switch (status) {
    case 'requested':
    case 'pending_approval':
      return 'bg-[#EAF0FB] text-[#1E3A8A]'
    case 'approved':
    case 'processing':
      return 'bg-amber-100 text-amber-900'
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-900'
    case 'failed':
    case 'rejected':
      return 'bg-red-100 text-red-900'
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

export function RefundStatusBadge({ status, label }: { status: RefundStatus; label: string }) {
  return <Badge className={cn('border-0', tone(status))}>{label}</Badge>
}
