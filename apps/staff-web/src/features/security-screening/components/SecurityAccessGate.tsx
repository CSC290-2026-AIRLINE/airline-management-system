import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useSecurityAccess } from '../use-security-access'
import '../fonts.css'
import '../screening.css'

export function SecurityAccessGate({ children }: { children: ReactNode }) {
  const { status, retry } = useSecurityAccess()
  if (status === 'allowed') return children
  return (
    <main className="sq-empty" aria-live="polite">
      {status === 'loading' ? (
        <p role="status">Checking access…</p>
      ) : (
        <>
          <h1>Security Screening</h1>
          <p role="alert">
            {status === 'denied'
              ? 'You do not have permission to access Security Screening.'
              : status === 'unauthenticated'
                ? 'Your session is unavailable. Please sign in again.'
                : 'Could not check your access. Please try again.'}
          </p>
          {status === 'error' && (
            <button type="button" onClick={retry}>
              Try again
            </button>
          )}
          <Link to="/customer-search">Back to Customer Search</Link>
        </>
      )}
    </main>
  )
}
