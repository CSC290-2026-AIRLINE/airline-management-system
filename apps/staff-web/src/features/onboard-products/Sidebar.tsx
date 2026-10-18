import { Link } from '@tanstack/react-router'
import { useAppAuth } from '../../auth/AuthProvider'
import styles from './Sidebar.module.css'

interface NavItem {
  label: string
  to: '/catering/catalog' | '/catering/offered-menu' | '/catering/orders' | '/catering/stock' | '/catering/flight-report'
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Product Catalog', to: '/catering/catalog' },
  { label: 'Offered menu', to: '/catering/offered-menu' },
  { label: 'Catering Orders', to: '/catering/orders' },
  { label: 'Stock', to: '/catering/stock' },
  { label: 'Flight Report', to: '/catering/flight-report' },
]

export function Sidebar() {
  const { isLoading, logout } = useAppAuth()

  return (
    <aside className={styles.sidebar} aria-label="Onboard products navigation">
      <div className={styles.brand}>
        <span className={styles.wordmark}>AIRLINES</span>
        <span className={styles.underline} />
        <span className={styles.subtitle}>Staff · Catering &amp; Stock</span>
      </div>

      <p className={styles.sectionLabel}>Catering &amp; Stock</p>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            // exact: false keeps the parent item highlighted while on a sub-page
            // (e.g. /catering/offered-menu/$routeId keeps "Offered menu" lit).
            activeOptions={{ exact: false }}
            activeProps={{ className: styles.linkActive }}
            className={styles.link}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className={styles.spacer} />

      <div className={styles.admin}>
        <p className={styles.adminLabel}>Administrator</p>
        <p className={styles.adminNote}>Navigation follows assigned staff permissions.</p>
        <button type="button" className={styles.signOut} onClick={() => void logout()} disabled={isLoading}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
