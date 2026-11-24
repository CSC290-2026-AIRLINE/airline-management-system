import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { SignUpButton, useAuth } from '@clerk/clerk-react'
import { useAppAuth, type AppUser } from '@customer-web/auth/AuthProvider'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'

/** Page frame, the same as the other customer pages: the shared SiteHeader comes from the root route. */
export function ComplaintPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 text-left md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </main>
  )
}

type ComplaintsPath = '/complaints' | '/complaints/check' | '/complaints/preferences'

const NAV_LINKS: { to: ComplaintsPath; label: string }[] = [
  { to: '/complaints', label: 'Make a complaint' },
  { to: '/complaints/check', label: 'Your complaints' },
  { to: '/complaints/preferences', label: 'Notification preferences' },
]

/** Tabs between the complaint pages, since the shared SiteHeader does not list them. Each tab is a link. */
export function ComplaintsNav({ current }: { current?: ComplaintsPath }) {
  return (
    <Tabs value={current ?? ''}>
      <TabsList aria-label="Customer service" className="h-auto flex-wrap">
        {NAV_LINKS.map((link) => (
          <TabsTrigger key={link.to} value={link.to} asChild>
            <Link to={link.to} search={link.to === '/complaints/check' ? { caseNumber: undefined } : undefined}>
              {link.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** Complaints are account-only, so a signed-out visitor sees this instead of the page. */
export function SignInPanel({ title, redirect, note }: { title: string; redirect: string; note?: string }) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          You need a Flython account to make a complaint or check a case. This keeps your cases private and lets us send you updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/login" search={{ redirect }}>
              Sign in
            </Link>
          </Button>
          {/* A new account goes to the dashboard first so the first sign-in setup (passport name) runs before any complaint. */}
          <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
            <Button type="button" variant="outline">
              Create an account
            </Button>
          </SignUpButton>
        </div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * Shows the page only to a signed-in customer whose session exchange worked. While Clerk or the session is loading it
 * says so; signed out it shows the sign-in panel; signed in to Clerk but without our session it offers a reload (sending
 * them to /login would bounce straight back here).
 */
export function AccountGate({
  signInTitle,
  redirect,
  note,
  children,
}: {
  signInTitle: string
  redirect: string
  note?: string
  children: (user: AppUser) => ReactNode
}) {
  const { isLoaded, isSignedIn } = useAuth()
  const { user, isLoading } = useAppAuth()

  if (!isLoaded || isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your account…
      </p>
    )
  }
  if (!isSignedIn) return <SignInPanel title={signInTitle} redirect={redirect} note={note} />
  if (!user) {
    return (
      <Alert variant="destructive" className="max-w-lg">
        <AlertTitle>We couldn't load your account</AlertTitle>
        <AlertDescription className="gap-3">
          <p>You are signed in, but we could not start your session. Please try again.</p>
          <Button type="button" size="sm" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  return <>{children(user)}</>
}
