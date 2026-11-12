import type { ReactNode } from 'react'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'

interface RefundsFrameProps {
  /** The screen code the page needs, for example `f5.refund_queue`. */
  screenCode: string
  /** The page's name in the words a person would use, for the no-access screen. */
  screenName: string
  title: string
  description: string
  children: ReactNode
}

/**
 * The frame every Feature 5b staff page sits in: the global staff sidebar, the page header, and the screen check.
 *
 * The check only decides what the page shows. The backend's `ScreenAccessGuard` is what actually refuses the request.
 */
export function RefundsFrame(props: RefundsFrameProps) {
  return (
    <RequireStaff>
      <AppShell>
        <Gate {...props} />
      </AppShell>
    </RequireStaff>
  )
}

function Gate({ screenCode, screenName, title, description, children }: RefundsFrameProps) {
  const { loading, canOpen, role } = useScreenAccess()

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Checking your access…</p>
  if (!canOpen(screenCode)) return <NoAccessScreen screenName={screenName} roleName={role?.name} />

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="m-0 font-sans text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </main>
  )
}
