import { useSecurityAccess } from '../use-security-access'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'

export function SecurityAccessGate({ children }: { children: ReactNode }) {
  const { status, retry } = useSecurityAccess()
  if (status === 'allowed') return children
  return (
    <main className="flex flex-col items-center gap-3 py-24 text-center" aria-live="polite">
      {status === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking access…
        </p>
      ) : (
        <>
          <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Security Screening</h1>
          <p role="alert" className="text-sm text-muted-foreground">
            {status === 'denied'
              ? 'You do not have permission to access Security Screening.'
              : status === 'unauthenticated'
                ? 'Your session is unavailable. Please sign in again.'
                : 'Could not check your access. Please try again.'}
          </p>
          <div className="flex gap-2">
            {status === 'error' && (
              <Button type="button" onClick={retry}>
                Try again
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/customer-search">Back to Customer Search</Link>
            </Button>
          </div>
        </>
      )}
    </main>
  )
}
