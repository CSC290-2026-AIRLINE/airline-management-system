import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { formatNow } from '../format'
import type { LoadState } from '../use-load'
import styles from './loyalty.module.css'

// The F11 staff shell: the loyalty sidebar, the page title and purpose, and the info banner.
export function StaffLoyaltyLayout({
  title,
  purpose,
  info,
  children,
}: {
  title: string
  purpose: string
  info: string
  children: ReactNode
}) {
  const { user } = useUser()
  const { logout, isLoading } = useAppAuth()
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Staff'

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <span className={styles.logo}>AIRLINES</span>
        <span className={styles.logoBar} />
        <span className={styles.sideCaps}>Staff · Loyalty</span>
        <nav className={styles.sideNav} aria-label="Loyalty programme">
          <span className={styles.sideCaps} style={{ marginBottom: 8 }}>
            Loyalty programme
          </span>
          <Link to="/loyalty/members">Member Lookup</Link>
          <Link to="/loyalty/rules">Loyalty Rules</Link>
          <Link to="/loyalty/award-release">Award Release</Link>
          <Link to="/loyalty/lounge">Lounge Desk</Link>
        </nav>
        <div className={styles.sideUser}>
          <strong>{name}</strong>
          <span>Navigation follows assigned staff permissions.</span>
          <button type="button" className={styles.signOut} onClick={() => void logout()} disabled={isLoading}>
            Sign out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.topRow}>
          <div className={styles.badges}>
            <span className={styles.badgeFeature}>FEATURE 11</span>
            <span className={styles.badgeStaff}>STAFF VIEW</span>
          </div>
          <span className={styles.meta}>
            {formatNow(new Date())} · {name}
          </span>
        </div>
        <h1>{title}</h1>
        <p className={styles.purpose}>{purpose}</p>
        <p className={styles.info}>{info}</p>
        {children}
      </main>
    </div>
  )
}

export function Loaded<T>({ state, retry, children }: { state: LoadState<T>; retry: () => void; children: (data: T) => ReactNode }) {
  switch (state.status) {
    case 'loading':
      return <p aria-live="polite">Loading…</p>
    case 'error':
      return (
        <div className={styles.error} role="alert">
          <p>{state.message}</p>
          <button type="button" className={styles.button} onClick={retry}>
            Try again
          </button>
        </div>
      )
    case 'ready':
      return <>{children(state.data)}</>
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}
