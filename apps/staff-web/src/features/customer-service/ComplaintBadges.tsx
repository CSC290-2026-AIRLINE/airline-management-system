import { Plane, User, Utensils, type LucideIcon } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import { STATUS_LABEL, TYPE_LABEL, type CaseStatus, type ComplaintType } from './types'

const STATUS_CLASS: Record<CaseStatus, string> = {
  with_supervisor: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-100 text-slate-700',
}

const TYPE_ICON: Record<ComplaintType, LucideIcon> = {
  employee: User,
  flight: Plane,
  food: Utensils,
}

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return <Badge className={cn('rounded-xl font-semibold', STATUS_CLASS[status], className)}>{STATUS_LABEL[status]}</Badge>
}

export function TypeLabel({ type }: { type: ComplaintType }) {
  const Icon = TYPE_ICON[type]
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {TYPE_LABEL[type]}
    </span>
  )
}
