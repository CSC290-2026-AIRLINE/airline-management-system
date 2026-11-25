import type { ReactNode } from 'react'
import { Page, PageContent, type PageWidth } from '@customer-web/components/Page'

/**
 * A booking page on the shared page shell. With a `title` it gets the navy banner (title, a line under it, actions on the
 * right, tabs along the bottom edge); without one it is just the content column, for a state that has no title block.
 * Booking pages hold a flow with a side panel, so they default to the wide column.
 */
export function PageShell({
  className,
  width = 'wide',
  title,
  subtitle,
  actions,
  tabs,
  children,
}: {
  className?: string
  width?: PageWidth
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  children: ReactNode
}) {
  if (title !== undefined) {
    return (
      <Page width={width} title={title} description={subtitle} actions={actions} tabs={tabs} className={className}>
        {children}
      </Page>
    )
  }
  return (
    <PageContent width={width} className={className}>
      {children}
    </PageContent>
  )
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
