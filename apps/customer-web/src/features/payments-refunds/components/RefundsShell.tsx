import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import '../refunds.css'

interface RefundsShellProps {
  title: string
  subtitle: string
  /** Which of the page tabs is open. */
  current: 'refunds' | 'vouchers'
  children: ReactNode
}

/**
 * The frame every Feature 5b customer page sits in: the brand, the page tabs and the heading.
 *
 * The frames put "Receipts", "My refunds" and "My vouchers" side by side as page tabs. Receipts belongs to Feature 5a and
 * is not in this branch, so its tab is drawn dimmed until the branches meet.
 */
export function RefundsShell({ title, subtitle, current, children }: RefundsShellProps) {
  return (
    <div className="rf-page">
      <header className="rf-header">
        <span className="rf-brand">Flython Airlines</span>
      </header>

      <main className="rf-main">
        <h1 className="rf-title">{title}</h1>
        <p className="rf-subtitle">{subtitle}</p>

        <nav aria-label="Receipts, refunds and vouchers" className="rf-tabs">
          {/* TODO(F5): link this to /receipts once Feature 5a's receipts are in the same branch. */}
          <span className="rf-tab" aria-disabled="true" title="Coming with feature 5a">
            Receipts
          </span>
          <Link to="/refunds" className="rf-tab" aria-current={current === 'refunds' ? 'page' : undefined}>
            My refunds
          </Link>
          <Link to="/vouchers" className="rf-tab" aria-current={current === 'vouchers' ? 'page' : undefined}>
            My vouchers
          </Link>
        </nav>

        {children}
      </main>
    </div>
  )
}
