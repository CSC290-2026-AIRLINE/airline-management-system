import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CustomerHeader } from '@customer-web/features/payments-checkout/components/CustomerHeader'
import { PageTabs, type PageTab } from '@customer-web/features/payments-checkout/components/PageTabs'

interface RefundsShellProps {
  title: string
  /** A line under the heading. */
  subtitle?: string
  /** Which of the page tabs is open. */
  current: 'refunds' | 'vouchers'
  /** A button on the right of the heading, such as "Request a refund". */
  action?: ReactNode
  children: ReactNode
}

/**
 * The frame every Feature 5b customer page sits in: the floating header, the page heading, the page tabs and the body.
 *
 * The frames put "Receipts", "My refunds" and "My vouchers" side by side as page tabs. Receipts is Feature 5a's page.
 *
 * The `customer-shell` class is what the stylesheet keys the full-width layout off (`#root:has(.customer-shell)`).
 *
 * `CustomerHeader`, `PageTabs` and `FilterChips` are Feature 5a's, shared by both.
 */
export function RefundsShell({ title, subtitle, current, action, children }: RefundsShellProps) {
  const navigate = useNavigate()
  const tabs: PageTab[] = [
    { value: 'receipts', label: 'Receipts' },
    { value: 'refunds', label: 'My refunds' },
    { value: 'vouchers', label: 'My vouchers' },
  ]

  return (
    <div className="customer-shell min-h-svh bg-page font-sans text-foreground">
      <CustomerHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 max-phone:px-3 max-phone:py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 font-sans text-3xl font-bold tracking-tight text-foreground max-phone:text-2xl">{title}</h1>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {subtitle && <p className="-mt-3 mb-5 text-base text-muted-foreground">{subtitle}</p>}

        <div className="mb-5">
          <PageTabs
            tabs={tabs}
            value={current}
            ariaLabel="Receipts, refunds and vouchers"
            onChange={(value) =>
              void navigate({ to: value === 'vouchers' ? '/vouchers' : value === 'receipts' ? '/receipts' : '/refunds' })
            }
          />
        </div>

        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 max-phone:px-3">
        <p className="m-0 text-sm text-muted-foreground">Prototype with sample data. Payments, cards and amounts are fictional.</p>
      </footer>
    </div>
  )
}
