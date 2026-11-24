import type { ReactNode } from 'react'
import { PageContent, PageHeader, type PageWidth } from '@customer-web/components/Page'

/**
 * The column of a booking page, on the shared page shell. Booking pages hold a flow with a side panel, so they default to
 * the wide column; a list or a detail page passes `width="standard"`.
 */
export function PageShell({ className, width = 'wide', children }: { className?: string; width?: PageWidth; children: ReactNode }) {
  return (
    <PageContent width={width} className={className}>
      {children}
    </PageContent>
  )
}

/** The title block every customer page uses. */
export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return <PageHeader title={title} description={subtitle} actions={actions} />
}

/** A centred message card: loading, empty, error and not-found states. */
export function MessageCard({ title, children, busy }: { title: ReactNode; children?: ReactNode; busy?: boolean }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-6 text-left" aria-busy={busy || undefined}>
      <h2 className="m-0 text-subheading">{title}</h2>
      {children}
    </section>
  )
}
