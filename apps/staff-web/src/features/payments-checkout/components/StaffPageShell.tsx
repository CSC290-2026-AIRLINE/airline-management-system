import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@staff-web/lib/utils'
import './payment-shell.css'

interface StaffPageShellProps {
  title: string
  subtitle?: string
  /** A control on the right of the navy bar — a link back, usually. */
  action?: ReactNode
  children: ReactNode
}

const NAV = [
  { to: '/payments/lookup', label: 'Payment lookup' },
  { to: '/payments/exceptions', label: 'Payment exceptions' },
] as const

/**
 * The frame the payment screens sit in: the navy bar with the two screen links, and the page body.
 *
 * The payment screens are staff screens of their own (`f5.payment_lookup` and `f5.payment_exceptions`), not tabs of the
 * admin console, so they get their own light frame rather than the console's sidebar.
 */
export function StaffPageShell({ title, subtitle, action, children }: StaffPageShellProps) {
  return (
    <div className="payment-shell min-h-svh bg-page font-sans text-foreground text-sm">
      <header className="bg-primary text-white">
        <div className="mx-auto flex max-w-260 flex-wrap items-center justify-between gap-3 px-4 py-3 max-tablet:flex-col max-tablet:items-start max-tablet:gap-2">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-bold tracking-wide">Airlines</span>
            <span className="text-sm text-white/70">{title}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <nav aria-label="Payment screens" className="flex flex-wrap items-center gap-4">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-sm text-white/80 hover:text-white data-[status=active]:font-semibold data-[status=active]:text-gold"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {action}
          </div>
        </div>
        {subtitle && <p className="mx-auto max-w-260 px-4 pb-3 text-sm text-white/70">{subtitle}</p>}
      </header>
      <main className="mx-auto max-w-260 px-4 py-6 max-tablet:px-3 max-tablet:py-4">{children}</main>
    </div>
  )
}

/** The white card every payment screen body sits in. */
export const PAYMENT_CARD = 'border-border font-sans'

/** A page-level message, used for the empty and error states. */
export function PageMessage({
  title,
  body,
  tone = 'muted',
  className,
}: {
  title: string
  body?: ReactNode
  tone?: 'muted' | 'danger'
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card px-6 py-8 text-center',
        tone === 'danger' && 'border-danger-line/40 bg-danger-soft',
        className,
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <h2 className={cn('m-0 font-sans text-base font-semibold text-foreground', tone === 'danger' && 'text-danger')}>{title}</h2>
      {body && <p className="mt-1 text-sm text-muted-foreground break-words">{body}</p>}
    </div>
  )
}
