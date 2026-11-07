import { useMemo } from 'react'
import { createMockApi } from './api/index.ts'
import { CheckInFlow } from './components/CheckInFlow.tsx'
import styles from './components/flow.module.css'

const LINKS = ['Book', 'My Trips', 'Membership', 'Help']

/** The standalone demo shell: the Vercel preview runs on the browser mock, no backend, no Clerk. */
export function DemoApp() {
  const api = useMemo(() => createMockApi(), [])

  return (
    <div className={styles.demoShell}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
      <header className={styles.demoNav}>
        <span className={styles.demoBrand}>
          Flython
          <span className={styles.demoBrandSub}>AIRLINES</span>
        </span>
        <div className={styles.demoLinks}>
          {LINKS.map((label) => (
            <span key={label} className={styles.demoLink}>
              {label}
            </span>
          ))}
        </div>
        <span className={styles.demoProfile}>
          <span className={styles.demoAvatar}>SW</span>
          Profile
        </span>
      </header>
      <CheckInFlow api={api} now={api.now} />
    </div>
  )
}
