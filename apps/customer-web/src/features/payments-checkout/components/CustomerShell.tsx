import type { ReactNode } from 'react'
import { CustomerHeader } from './CustomerHeader'

interface CustomerShellProps {
  title: string
  /** A link or button on the right of the page heading — the "export" button, for example. */
  action?: ReactNode
  children: ReactNode
}

/**
 * The frame every customer page in this feature sits in: the floating header card, the page heading and the body.
 *
 * The `customer-shell` class is what the stylesheet keys the full-width layout off (`#root:has(.customer-shell)`),
 * so the starter pages keep their centred column while these pages fill the window.
 */
export function CustomerShell({ title, action, children }: CustomerShellProps) {
  return (
    <div className="customer-shell min-h-svh bg-page font-sans text-foreground">
      <CustomerHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 max-phone:px-3 max-phone:py-6">
        {/* The page heading ---------------------------------------------- */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 font-sans text-3xl font-bold tracking-tight text-foreground max-phone:text-2xl">{title}</h1>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 max-phone:px-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm text-muted-foreground">Prototype with sample data. Payments, cards and amounts are fictional.</p>
          {/* The frames put "Book" at the foot of the page. The booking feature is not in this app yet. */}
          <span aria-disabled="true" title="Coming with the booking feature" className="cursor-not-allowed text-sm font-medium text-foreground">
            Book
          </span>
        </div>
      </footer>
    </div>
  )
}
