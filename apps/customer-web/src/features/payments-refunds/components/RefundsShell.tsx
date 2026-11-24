import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CustomerShell } from '@customer-web/features/payments-checkout/components/CustomerShell'
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

const TABS: PageTab[] = [
  { value: 'receipts', label: 'Receipts' },
  { value: 'refunds', label: 'My refunds' },
  { value: 'vouchers', label: 'My vouchers' },
]

/** The frame every customer refunds page sits in: the receipts page's shell, the page tabs and a line under the heading. */
export function RefundsShell({ title, subtitle, current, action, children }: RefundsShellProps) {
  const navigate = useNavigate()

  return (
    <CustomerShell
      title={title}
      description={subtitle}
      action={action}
      tabs={
        <PageTabs
          tabs={TABS}
          value={current}
          ariaLabel="Receipts, refunds and vouchers"
          onChange={(value) => void navigate({ to: value === 'vouchers' ? '/vouchers' : value === 'receipts' ? '/receipts' : '/refunds' })}
        />
      }
    >
      {children}
    </CustomerShell>
  )
}
