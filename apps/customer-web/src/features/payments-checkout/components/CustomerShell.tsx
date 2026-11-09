import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

interface CustomerShellProps {
  title: string
  subtitle?: string
  /** A link or button on the right of the header — the "back to receipts" link, for example. */
  action?: ReactNode
  children: ReactNode
}

/**
 * The frame every customer page in this feature sits in: the navy header and the page body.
 *
 * The `customer-shell` class is what the stylesheet keys the full-width layout off (`#root:has(.customer-shell)`),
 * so the starter pages keep their centred column while these pages fill the window.
 */
export function CustomerShell({ title, subtitle, action, children }: CustomerShellProps) {
  return (
    <div className="customer-shell min-h-svh bg-page font-sans text-foreground">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-200 flex-wrap items-center justify-between gap-3 px-4 py-4 max-tablet:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-gold uppercase">Flython</p>
            <h1 className="m-0 mt-1 font-heading text-xl font-bold text-white">{title}</h1>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {subtitle && <p className="mx-auto max-w-200 px-4 pb-4 text-sm text-white/75">{subtitle}</p>}
      </header>
      <main className="mx-auto max-w-200 px-4 py-6 max-phone:px-3 max-phone:py-4">{children}</main>
      <footer className="mx-auto max-w-200 px-4 pb-8 text-xs text-muted-foreground max-phone:px-3">
        <p>
          Amounts are shown in US dollars. Miles are not money — they are shown next to the cash that was charged.{' '}
          <Link to="/receipts" className="underline underline-offset-4">
            See all receipts
          </Link>
        </p>
      </footer>
    </div>
  )
}
