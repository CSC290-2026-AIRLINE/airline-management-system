import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { LoadState } from '../use-load'
import styles from './loyalty.module.css'

// Header band with the membership tabs (Overview, Statement, Benefits, Redemptions), then the page body.
export function LoyaltyLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <nav className={styles.tabs} aria-label="Membership">
          <Link to="/loyalty" activeOptions={{ exact: true }}>
            Overview
          </Link>
          <Link to="/loyalty/statement">Statement</Link>
          <Link to="/loyalty/benefits">Benefits</Link>
          <Link to="/loyalty/redemptions">Redemptions</Link>
        </nav>
      </header>
      <div className={styles.body}>{children}</div>
    </main>
  )
}

// Renders the loading and error states of a request, and the page once it is ready.
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
