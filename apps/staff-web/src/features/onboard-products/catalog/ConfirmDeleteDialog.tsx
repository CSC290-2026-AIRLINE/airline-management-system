// Small confirmation dialog used before deleting a product. Shows the
// product name and refuses with a custom message when PRODUCT_IN_USE comes back.

import { useRef } from 'react'
import { useDialogFocusTrap } from './useDialogFocusTrap'
import styles from './ProductDialog.module.css'
import sharedStyles from './ConfirmDeleteDialog.module.css'
import type { Product } from '../api/types'

interface Props {
  product: Product
  busy: boolean
  errorMessage: string | null
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDeleteDialog({ product, busy, errorMessage, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useDialogFocusTrap(true, dialogRef, onClose)

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={sharedStyles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cd-title"
        aria-describedby="cd-desc"
      >
        <h2 id="cd-title" className={sharedStyles.title}>
          Delete {product.name}?
        </h2>
        <p id="cd-desc" className={sharedStyles.body}>
          This removes the product from the catalog. Existing orders keep their name and price.
        </p>
        {errorMessage && (
          <p className={sharedStyles.error} role="alert">
            {errorMessage}
          </p>
        )}
        <div className={sharedStyles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={sharedStyles.deleteButton} onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
