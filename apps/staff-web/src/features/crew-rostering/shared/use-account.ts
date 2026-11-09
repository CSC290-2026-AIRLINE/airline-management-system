import { useAppAuth } from '../../../auth/AuthProvider'

const ROLE_LABELS: Record<string, { full: string; short: string }> = {
  admin: { full: 'Administrator', short: 'ADMIN' },
}

/**
 * Who the sidebar and the mobile account chip say is signed in, plus the sign-out they call.
 *
 * These pages sit behind `_authenticated`, so a signed-out visitor never reaches them.
 * `user === null` therefore means the `/api/auth/session` exchange is still in flight, not
 * that anyone signed out, so the label falls back to the admin role for that brief window.
 */
export function useAccount() {
  const { user, logout } = useAppAuth()
  const type = user?.type ?? 'admin'
  const label = ROLE_LABELS[type] ?? { full: type, short: type.toUpperCase() }
  return { full: label.full, short: label.short, signOut: () => void logout() }
}
