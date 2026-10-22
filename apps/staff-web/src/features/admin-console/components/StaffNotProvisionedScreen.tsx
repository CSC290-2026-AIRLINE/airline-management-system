import type { ReactNode } from 'react'
import { StatusCard } from './StatusCard'

interface StaffNotProvisionedScreenProps {
  /**
   * The email that signed in. Defaults to the Clerk account's own email from `AuthProvider`, which is the address an
   * admin has to match when creating the staff row — so never let a caller pass a different one.
   */
  email?: string | null
  /** Where "Back to sign in" navigates. Defaults to the login route. */
  signInTo?: string
  children?: ReactNode
}

/**
 * Shown when someone signs in successfully but has no `staff` row yet. They authenticated — the token is valid, the
 * JWT guard let them through — they simply do not exist as staff yet, which is a provisioning gap rather than an
 * authorization one. That is why it is a separate screen from `NoAccessScreen`: "ask an admin to add you" and "ask an
 * admin for permission" are different instructions.
 *
 * Detect it with the `provisioned` flag on `GET /api/me/screens`, never by an empty `screen_codes` — a real staff
 * member whose role holds no screens returns the same empty list.
 *
 * ```tsx
 * const { provisioned, loading } = useScreenAccess()
 * if (loading) return <p className="muted">Checking your access…</p>
 * if (!provisioned) return <StaffNotProvisionedScreen />
 * ```
 */
export function StaffNotProvisionedScreen({ email, signInTo = '/login', children }: StaffNotProvisionedScreenProps) {
  return (
    <StatusCard
      icon={
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      }
      title="No staff account for this email"
      body={
        <>
          <span className="status-email">{email ?? 'This account'}</span> hasn&apos;t been set up as staff yet. Ask an Admin to create your
          account, then sign in again.
        </>
      }
      badgeKey="STAFF_NOT_PROVISIONED"
      badgeDetail=" · logged in the audit log"
      action={{ label: 'Back to sign in', href: signInTo }}
    >
      {children}
    </StatusCard>
  )
}
