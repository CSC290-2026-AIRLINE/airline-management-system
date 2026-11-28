import type { ReactNode } from 'react'
import { Card } from '@staff-web/components/ui/card'
import { cn } from '@staff-web/lib/utils'
import { trendClass, type Trend } from '../lib-styles'

interface KpiCardProps {
  label: string
  value: string
  hint: string
  comparison?: string
  trend?: Trend
  /** A link under the figure, to the part of the page that lists what it counts. */
  action?: ReactNode
}

/** One headline figure: a small label, the number, a line of context and the change against the previous period. */
export function KpiCard({ label, value, hint, comparison, trend = 'neutral', action }: KpiCardProps) {
  return (
    <Card className="min-w-0 gap-1 px-5 py-4 shadow-none">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl leading-tight font-bold tracking-tight break-words text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {comparison && <p className={cn('text-xs font-medium', trendClass(trend))}>{comparison}</p>}
      {action}
    </Card>
  )
}
