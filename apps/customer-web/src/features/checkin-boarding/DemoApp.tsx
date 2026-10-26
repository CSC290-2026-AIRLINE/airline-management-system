import { useMemo } from 'react'
import { createMockApi } from './api/index.ts'
import { CheckInFlow } from './components/CheckInFlow.tsx'
import styles from './components/flow.module.css'

/** The standalone demo shell: the Vercel preview runs on the browser mock, no backend, no Clerk. */
export function DemoApp() {
  const api = useMemo(() => createMockApi(), [])

  return (
    <div className={styles.demoShell}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@600;800&display=swap"
      />
      <header className={styles.demoBar}>
        <span className={styles.demoBrand}>Flython</span>
        <h1 className={styles.demoTitle}>Online check-in</h1>
      </header>
      <CheckInFlow api={api} />
    </div>
  )
}
