import { Card, CardContent } from '@staff-web/components/ui/card'

interface KpiCardProps {
  label: string
  value: string
  hint: string
}

/** One headline number. The hint says what the number is made of, so it can be checked against the tables. */
export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 px-5">
        <p className="m-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="m-0 font-heading text-2xl font-bold text-primary">{value}</p>
        <p className="m-0 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
