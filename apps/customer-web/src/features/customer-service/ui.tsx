import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { SignUpButton, useAuth } from '@clerk/clerk-react'
import { useAppAuth, type AppUser } from '@customer-web/auth/AuthProvider'
import { alertStyle, btnPrimary, btnSecondary, cardStyle, errorStyle, focusRing, mutedStyle } from './styles'

/** Page wrapper. The shared SiteHeader comes from the root route, so this adds only the background and width. */
export function ComplaintPage({ children }: { children: ReactNode }) {
  return (
    <div
      className="customer-shell"
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#F7F9FC',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#0A1424',
        textAlign: 'left',
      }}
    >
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 80px' }}>{children}</main>
    </div>
  )
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0A1424' }}>
        {label}
      </label>
      {children}
      {error && (
        <div role="alert" style={errorStyle}>
          {error}
        </div>
      )}
    </div>
  )
}

type ComplaintsPath = '/complaints' | '/complaints/check' | '/complaints/preferences'

const NAV_LINKS: { to: ComplaintsPath; label: string }[] = [
  { to: '/complaints', label: 'Make a complaint' },
  { to: '/complaints/check', label: 'Your complaints' },
  { to: '/complaints/preferences', label: 'Notification preferences' },
]

/** Links between the complaint pages, since the shared SiteHeader does not list them. */
export function ComplaintsNav({ current }: { current?: ComplaintsPath }) {
  return (
    <nav aria-label="Customer service" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', fontSize: '14px' }}>
      {NAV_LINKS.map((link) =>
        link.to === current ? (
          <span key={link.to} aria-current="page" style={{ fontWeight: 600, color: '#0A1424' }}>
            {link.label}
          </span>
        ) : (
          <Link
            key={link.to}
            to={link.to}
            search={link.to === '/complaints/check' ? { caseNumber: undefined } : undefined}
            className={focusRing}
            style={{ fontWeight: 600, color: '#2563EB', textDecoration: 'none', borderRadius: '4px' }}
          >
            {link.label}
          </Link>
        ),
      )}
    </nav>
  )
}

/** Complaints are account-only, so a signed-out visitor sees this instead of the page. */
export function SignInPanel({ title, redirect, note }: { title: string; redirect: string; note?: string }) {
  return (
    <section
      aria-labelledby="sign-in-title"
      style={{ ...cardStyle, maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <h2 id="sign-in-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>
        {title}
      </h2>
      <p style={{ margin: 0, fontSize: '14px', color: '#677287', lineHeight: 1.5 }}>
        You need a Flython account to make a complaint or check a case. This keeps your cases private and lets us send you updates.
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Link to="/login" search={{ redirect }} className={focusRing} style={{ ...btnPrimary, textDecoration: 'none' }}>
          Sign in
        </Link>
        {/* A new account goes to the dashboard first so the first sign-in setup (passport name) runs before any complaint. */}
        <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
          <button type="button" className={focusRing} style={btnSecondary}>
            Create an account
          </button>
        </SignUpButton>
      </div>
      {note && <p style={{ ...mutedStyle, margin: 0, fontSize: '12px' }}>{note}</p>}
    </section>
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
      <p role="status" style={mutedStyle}>
        Loading your account…
      </p>
    )
  }
  if (!isSignedIn) return <SignInPanel title={signInTitle} redirect={redirect} note={note} />
  if (!user) {
    return (
      <div role="alert" style={{ ...alertStyle, maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <strong>We couldn't load your account</strong>
        <span>You are signed in, but we could not start your session. Please try again.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={focusRing}
          style={{ ...btnPrimary, alignSelf: 'flex-start' }}
        >
          Try again
        </button>
      </div>
    )
  }
  return <>{children(user)}</>
}
