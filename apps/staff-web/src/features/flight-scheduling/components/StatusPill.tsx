import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import { capitalize } from '../format'

const TONE = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  crit: 'border-red-200 bg-red-50 text-red-700',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
}

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  active: 'good',
  ok: 'good',
  approved: 'good',
  resolved: 'good',
  arrived: 'good',
  departed: 'good',
  delayed: 'warn',
  holding: 'warn',
  diverted: 'warn',
  pending: 'warn',
  alternative_offered: 'warn',
  cancelled: 'crit',
  failed: 'crit',
  rejected: 'crit',
  open: 'crit',
}

// A shadcn Badge for a status value; the tone follows the status.
export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <Badge variant="outline" className={cn(TONE[STATUS_TONE[status] ?? 'neutral'])}>
      {label ?? capitalize(status)}
    </Badge>
  )
}
