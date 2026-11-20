import { Card, CardContent } from '@staff-web/components/ui/card'

interface KpiCardProps {
  label: string
  value: string
  hint: string
  comparison?: string
  trend?: 'good' | 'bad' | 'neutral'
}

export function KpiCard({ label, value, hint, comparison, trend = 'neutral' }: KpiCardProps) {
  return (
    <Card className="bi-kpi">
      <CardContent>
        <p className="bi-kpi-label">{label}</p>
        <p className="bi-kpi-value">{value}</p>
        <p className="bi-kpi-hint">{hint}</p>
        {comparison && <p className={`bi-kpi-comparison bi-trend-${trend}`}>{comparison}</p>}
      </CardContent>
    </Card>
  )
}
