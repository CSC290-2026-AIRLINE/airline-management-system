import type { ReactNode } from 'react'
import { Card, CardContent } from '@staff-web/components/ui/card'

// A row of big numbers with a label each, such as "4 flights in view".
export function Stats({ items }: { items: { value: ReactNode; label: ReactNode }[] }) {
  return (
    <dl className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] justify-items-start gap-2">
      {items.map((item, i) => (
        <Card key={i} className="w-full max-w-44 gap-0 py-2">
          <CardContent className="px-3">
            <dd className="text-[length:var(--fs-text-h4)] leading-tight font-bold">{item.value}</dd>
            <dt className="text-[length:var(--fs-text-caption)] text-muted-foreground">{item.label}</dt>
          </CardContent>
        </Card>
      ))}
    </dl>
  )
}
