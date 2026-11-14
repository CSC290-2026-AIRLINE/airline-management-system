import type { ReactNode } from 'react'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { cn } from '@staff-web/lib/utils'

interface StaffPageShellProps {
  title: string
  subtitle?: string
  children: ReactNode
}

/**
 * The frame the payment screens sit in: the global staff sidebar (the same one the Refund queue and the pricing screens
 * use), the page heading and the body.
 *
 * `RequireStaff` is on the `/payments` layout route, so `AppShell` can read the caller's role. The per-screen check
 * stays in each page.
 */
export function StaffPageShell({ title, subtitle, children }: StaffPageShellProps) {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <header className="mb-6">
          <h1 className="m-0 font-sans text-2xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 mb-0 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
        </header>
        {children}
      </main>
    </AppShell>
  )
}

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
        'rounded-2xl border border-border bg-card px-6 py-8 text-center',
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
