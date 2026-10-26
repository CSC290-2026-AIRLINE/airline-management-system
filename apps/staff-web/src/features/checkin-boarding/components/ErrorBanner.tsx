import styles from './ErrorBanner.module.css'

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null
  return (
    <div className={styles.banner} role="alert">
      <span>{message}</span>
      {onDismiss ? (
        <button type="button" className={styles.close} onClick={onDismiss} aria-label="Dismiss the message">
          ×
        </button>
      ) : null}
    </div>
  )
}
