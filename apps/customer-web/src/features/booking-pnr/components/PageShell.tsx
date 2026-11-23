import type { ReactNode } from 'react'
import { cn } from '@customer-web/lib/utils'

/** The centred column of a booking page, with the title block every customer page uses. */
export function PageShell({ className, children }: { className?: string; children: ReactNode }) {
  return <main className={cn('mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:py-10', className)}>{children}</main>
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <div className="text-base text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** A centred message card: loading, empty, error and not-found states. */
export function MessageCard({ title, children, busy }: { title: ReactNode; children?: ReactNode; busy?: boolean }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-6 text-left shadow-xs" aria-busy={busy || undefined}>
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
