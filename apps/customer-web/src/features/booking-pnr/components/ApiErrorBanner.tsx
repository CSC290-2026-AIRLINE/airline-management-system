import type { ApiError } from '../api/client'
import styles from './ApiErrorBanner.module.css'
import '../styles/tokens.css'

export function ApiErrorBanner({ error }: { error: ApiError }) {
  return (
    <div className={styles.banner} role="alert">
      <span className={styles.code}>{error.status > 0 ? `${error.status} ${error.code}` : error.code}</span>
      <span>{error.message}</span>
    </div>
  )
}
