import type { ReactNode } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import { STATUS_LABEL, TYPE_LABEL, type CaseStatus, type ComplaintType } from './types'

const STATUS_CLASS: Record<CaseStatus, string> = {
  with_supervisor: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-100 text-slate-700',
}

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return <Badge className={cn('rounded-xl font-semibold', STATUS_CLASS[status], className)}>{STATUS_LABEL[status]}</Badge>
}

/** A soft coloured badge with a leading dot, for statuses that are not complaint statuses (e.g. message delivery). */
export type Tone = 'warning' | 'info' | 'success' | 'danger' | 'neutral'

const TONE_CLASS: Record<Tone, string> = {
  warning: 'bg-warning-soft text-warning',
  info: 'bg-blue-50 text-blue-800',
  success: 'bg-success-soft text-success-strong',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-muted text-muted-foreground',
}

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge className={cn('gap-1.5 rounded-md font-semibold', TONE_CLASS[tone])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </Badge>
  )
}

/** The complaint type as a plain outlined badge, for tables. */
export function TypeBadge({ type }: { type: ComplaintType }) {
  return (
    <Badge variant="outline" className="rounded-md font-medium text-muted-foreground">
      {TYPE_LABEL[type]}
    </Badge>
  )
}
