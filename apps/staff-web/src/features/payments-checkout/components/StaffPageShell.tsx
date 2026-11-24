import type { ReactNode } from 'react'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Card, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'

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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
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
  if (tone === 'danger') {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTitle>{title}</AlertTitle>
        {body && <AlertDescription className="break-words">{body}</AlertDescription>}
      </Alert>
    )
  }
  return (
    <Card className={className} role="status">
      <CardHeader className="text-center">
        <CardTitle className="text-base">{title}</CardTitle>
        {body && <CardDescription className="break-words">{body}</CardDescription>}
      </CardHeader>
    </Card>
  )
}
