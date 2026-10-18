// A small success/info banner shown at the top of the page after a mutation.
// Auto-dismisses after a few seconds. Matches the green banner in the prototype.

import { useEffect } from 'react'
import styles from './Toast.module.css'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastData {
  id: number
  kind: ToastKind
  message: string
}

interface Props {
  toast: ToastData
  onDismiss: (id: number) => void
  autoDismissMs?: number
}

export function Toast({ toast, onDismiss, autoDismissMs = 5000 }: Props) {
  useEffect(() => {
    if (toast.kind === 'error') return // errors wait for the user to dismiss them
    const t = setTimeout(() => onDismiss(toast.id), autoDismissMs)
    return () => clearTimeout(t)
  }, [toast, autoDismissMs, onDismiss])

  return (
    <div className={`${styles.toast} ${styles[toast.kind]}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span className={styles.icon} aria-hidden="true">
        {toast.kind === 'error' ? '⚠' : '✓'}
      </span>
      <span className={styles.message}>{toast.message}</span>
      <button type="button" className={styles.close} onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
