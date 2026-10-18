// Confirm dialog used by the offered menu bulk actions and the
// "clear exception" flow. Modal, ESC-closes, focus-trapped.

import { useEffect, useRef, useState } from 'react'
import { useDialogFocusTrap } from '@staff-web/features/onboard-products/catalog'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  danger?: boolean
}

export function ConfirmDialog({ title, body, confirmLabel, busy, onClose, onConfirm, danger = false }: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [open] = useState(true)
  useDialogFocusTrap(open, ref, onClose)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className={styles.dialog} ref={ref}>
        <h2 id="confirm-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={danger ? styles.danger : styles.primary} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
