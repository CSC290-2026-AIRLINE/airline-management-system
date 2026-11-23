// Small shadcn-based building blocks shared by the onboard products staff pages.

import type { ReactNode } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'

/** The page title block: the same heading and description every staff page uses. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="m-0 max-w-2xl text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** One number with a small label above it. */
export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="gap-1">
        <CardDescription className="text-xs font-medium tracking-wide uppercase">{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
