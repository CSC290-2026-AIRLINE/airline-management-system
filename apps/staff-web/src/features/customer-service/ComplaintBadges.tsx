import { Plane, User, Utensils, type LucideIcon } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import type { ComplaintCategory, ComplaintStatus } from './types'

const STATUS_CLASS: Record<ComplaintStatus, string> = {
  Pending: 'bg-amber-100 text-amber-800',
  'In Review': 'bg-blue-100 text-blue-800',
  Escalated: 'bg-red-100 text-red-800',
  Resolved: 'bg-emerald-100 text-emerald-800',
  Closed: 'bg-slate-100 text-slate-700',
}

const CATEGORY_ICON: Record<ComplaintCategory, LucideIcon> = {
  Employee: User,
  Flight: Plane,
  Food: Utensils,
}

export function StatusBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  return <Badge className={cn('rounded-xl font-semibold', STATUS_CLASS[status], className)}>{status}</Badge>
}

export function CategoryLabel({ category }: { category: ComplaintCategory }) {
  const Icon = CATEGORY_ICON[category]
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {category}
    </span>
  )
}
