import type { ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { useMyAccess } from '@staff-web/features/admin-console/components/MyAccessProvider'
import { cn } from '@staff-web/lib/utils'
import { StaffSidebar } from './StaffSidebar'
import './payment-shell.css'

interface StaffPageShellProps {
  title: string
  subtitle?: string
  children: ReactNode
}

/**
 * The frame the payment screens sit in: the workspace sidebar, the feature pills, the page heading and the body.
 *
 * This is the frames' staff view — the navy admin workspace on the left, "Feature 5" and "Staff view" above the
 * heading, and the signed-in member on the right.
 */
export function StaffPageShell({ title, subtitle, children }: StaffPageShellProps) {
  const { logout } = useAppAuth()
  const { role } = useMyAccess()
  const roleName = role?.name ?? 'Admin'

  return (
    <div className="payment-shell flex min-h-svh bg-page font-sans text-foreground">
      <StaffSidebar roleName={roleName} onSignOut={() => void logout()} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The feature pills --------------------------------------------- */}
        <header className="flex items-center gap-3 px-8 pt-6 max-tablet:px-4">
          <span className="rounded-md border border-warning/40 bg-warning-soft px-3 py-1 text-xs font-semibold tracking-wide text-foreground uppercase">
            Staff view
          </span>
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase">Feature 5</span>
          <span className="ml-auto text-sm text-muted-foreground">{roleName}</span>
        </header>

        <main className="flex-1 px-8 pb-10 max-tablet:px-4">
          {/* The heading ------------------------------------------------- */}
          <div className="mt-6 mb-6">
            <h1 className="m-0 font-sans text-4xl font-bold tracking-tight text-foreground max-tablet:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 mb-0 max-w-3xl text-lg text-muted-foreground">{subtitle}</p>}
          </div>

          {children}
        </main>
      </div>
    </div>
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
