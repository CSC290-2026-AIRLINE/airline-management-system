import { Badge } from '@customer-web/components/ui/badge'
import { cn } from '@customer-web/lib/utils'

export type ChipTone = 'confirmed' | 'held' | 'completed' | 'cancelled' | 'expired'

// The status colours of the app's theme: ok, warn and danger, softened for a chip.
const TONE_CLASS: Record<ChipTone, string> = {
  confirmed: 'border-ok/25 bg-ok/10 text-ok',
  held: 'border-warn/25 bg-warn/10 text-warn',
  completed: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-danger/25 bg-danger/10 text-danger',
  expired: 'border-border bg-muted text-muted-foreground',
}

export function StatusChip({ label, tone, className }: { label: string; tone: ChipTone; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', TONE_CLASS[tone], className)}>
      {label}
    </Badge>
  )
}
