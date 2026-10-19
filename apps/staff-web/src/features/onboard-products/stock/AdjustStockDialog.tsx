// Adjust stock dialog. Reason (spoilage, damage, expired, count_correction),
// quantity to remove, optional note, and a live "on hand after" preview.
// On save, calls createStockMovement and tells the parent to refresh.
/* eslint-disable react-hooks/set-state-in-effect -- reset validation error as the form changes */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useDialogFocusTrap } from '../catalog/useDialogFocusTrap'
import { StockApiError, useOnboardApi } from '../api'
import type { AdjustStockInput, StockMovementReason, WarehouseStockRow } from '../api/types'
import styles from './AdjustStockDialog.module.css'

const REASONS: { value: NonNullable<StockMovementReason>; label: string }[] = [
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'damage', label: 'Damage' },
  { value: 'expired', label: 'Expired' },
  { value: 'count_correction', label: 'Count correction' },
]

interface Props {
  row: WarehouseStockRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

export function AdjustStockDialog({ row, onClose, onSaved, onError }: Props) {
  const api = useOnboardApi()
  const headingId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useDialogFocusTrap(true, dialogRef, onClose)

  const [reason, setReason] = useState<NonNullable<StockMovementReason> | ''>('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const parsedQuantity = useMemo(() => {
    if (quantity.trim() === '') return null
    const n = Number(quantity)
    return Number.isFinite(n) ? n : Number.NaN
  }, [quantity])

  const available = row.quantityOnHand - row.quantityReserved

  const onHandAfter = useMemo(() => {
    if (parsedQuantity == null || Number.isNaN(parsedQuantity)) return null
    if (parsedQuantity < 0) return null
    return row.quantityOnHand - parsedQuantity
  }, [parsedQuantity, row.quantityOnHand])

  const quantityInvalid = parsedQuantity != null && (Number.isNaN(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > available)

  // Reset any prior error when the inputs change.
  useEffect(() => {
    setError(null)
  }, [reason, quantity, note])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const nextErrors: string[] = []
    if (!reason) nextErrors.push('Pick a reason for this adjustment.')
    if (parsedQuantity == null || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      nextErrors.push('Quantity must be greater than zero.')
    } else if (parsedQuantity > available) {
      nextErrors.push(`Only ${available} units are available (${row.quantityReserved} are reserved).`)
    }
    if (nextErrors.length > 0) {
      setError(nextErrors[0])
      return
    }

    setSubmitting(true)
    try {
      const input: AdjustStockInput = {
        warehouseId: row.warehouseId,
        productId: row.productId,
        quantity: parsedQuantity as number,
        reason: reason as NonNullable<StockMovementReason>,
        note: note.trim() === '' ? null : note.trim(),
      }
      await api.stock.createStockMovement(input)
      onSaved(`Removed ${input.quantity} of ${row.productName}.`)
    } catch (err) {
      if (err instanceof StockApiError) {
        setError(err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not adjust the stock.'
        setError(message)
        onError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className={styles.header}>
          <h2 id={headingId} className={styles.title}>
            Adjust stock
          </h2>
          <p className={styles.subtitle}>
            {row.productName} · {row.warehouseId.replace('w-', '').toUpperCase()} warehouse
          </p>
        </header>

        <div className={styles.summary}>
          <p className={styles.summaryLabel}>Currently on hand</p>
          <p className={styles.summaryValue}>{row.quantityOnHand}</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="adj-reason" className={styles.label}>
              Reason
            </label>
            <select
              id="adj-reason"
              className={styles.select}
              value={reason}
              onChange={(e) => setReason(e.target.value as NonNullable<StockMovementReason> | '')}
            >
              <option value="">Select a reason</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="adj-qty" className={styles.label}>
              Quantity to remove
            </label>
            <input
              id="adj-qty"
              className={styles.input}
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoComplete="off"
            />
            {parsedQuantity != null && parsedQuantity > available && (
              <p className={styles.error} role="alert">
                Only {available} units are available ({row.quantityReserved} are reserved).
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="adj-note" className={styles.label}>
              Note (optional)
            </label>
            <input
              id="adj-note"
              className={styles.input}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. cold room failure"
              autoComplete="off"
            />
          </div>

          {onHandAfter != null && !quantityInvalid && <p className={styles.preview}>On hand after adjustment: {onHandAfter}</p>}
          {onHandAfter != null && quantityInvalid && (
            <p className={`${styles.preview} ${styles.previewInvalid}`}>On hand after adjustment: {onHandAfter}</p>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <footer className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.confirmButton}
              disabled={submitting || !reason || parsedQuantity == null || quantityInvalid}
            >
              {submitting ? 'Saving…' : 'Confirm adjustment'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
