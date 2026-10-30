import { useState } from 'react'
import { useMockStaffApi } from './api/use-staff-api.ts'
import { CounterPage } from './components/CounterPage.tsx'
import { GatePage } from './components/GatePage.tsx'
import './styles/tokens.css'
import styles from './DemoApp.module.css'

/** The demo shell: the staff screens on the mock API, without Clerk and without a backend. */
export function DemoApp() {
  const api = useMockStaffApi()
  const [tab, setTab] = useState<'counter' | 'gate'>('counter')

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.logo}>
          Flython<small>STAFF</small>
        </span>
        <h1 className={styles.title}>Check-in &amp; boarding</h1>
        <nav className={styles.tabs}>
          <button type="button" className={styles.tab} aria-pressed={tab === 'counter'} onClick={() => setTab('counter')}>
            Check-in counter
          </button>
          <button type="button" className={styles.tab} aria-pressed={tab === 'gate'} onClick={() => setTab('gate')}>
            Gate
          </button>
        </nav>
      </header>
      <main className={styles.body}>{tab === 'counter' ? <CounterPage api={api} /> : <GatePage api={api} />}</main>
    </div>
  )
}
