import type { ReactNode } from 'react'
import { Card } from '@staff-web/components/ui/card'

/** One KPI tile: a small label, the number, and an optional line of context under it. */
export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="gap-1 px-5 py-4 shadow-none">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl leading-tight font-bold text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  )
}
