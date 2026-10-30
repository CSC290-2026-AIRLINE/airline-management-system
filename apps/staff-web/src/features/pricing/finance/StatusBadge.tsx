import { Badge } from '@staff-web/components/ui/badge'
import type { BillStatus } from './bill-status'
import { shortDate } from './finance-format'

// Colours from the Figma badges (Overdue, Scheduled, Paid 5 Oct).
export function StatusBadge({ status }: { status: BillStatus }) {
  const base = 'h-auto rounded-xl px-2.5 py-1 text-[11px] font-semibold'
  switch (status.kind) {
    case 'overdue':
      return <Badge className={`${base} bg-[#fde4e1] text-[#b42318]`}>Overdue</Badge>
    case 'scheduled':
      return <Badge className={`${base} bg-[#dbeafe] text-[#1d4ed8]`}>Scheduled</Badge>
    case 'paid':
      return <Badge className={`${base} bg-(--pr-good-bg) text-(--pr-good)`}>Paid {shortDate(status.on)}</Badge>
    default: {
      const unknown: never = status
      return unknown
    }
  }
}
