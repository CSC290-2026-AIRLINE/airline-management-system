import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'

// Booking and request states in the staff theme's status colours.
const TONE: Record<string, string> = {
  confirmed: 'border-success/25 bg-success-soft text-success',
  accepted: 'border-success/25 bg-success-soft text-success',
  held: 'border-warning/25 bg-warning-soft text-warning',
  requested: 'border-warning/25 bg-warning-soft text-warning',
  cancelled: 'border-danger/25 bg-danger-soft text-danger',
  rejected: 'border-danger/25 bg-danger-soft text-danger',
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('capitalize', TONE[status] ?? 'bg-muted text-muted-foreground', className)}>
      {label ?? status}
    </Badge>
  )
}
