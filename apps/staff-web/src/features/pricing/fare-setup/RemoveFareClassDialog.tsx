import { useState } from 'react'
import { errorMessage, usePricingApi, type FareClass } from '../api'
import { Dialog } from '../components/Dialog'
import { cabinLabel } from '../format'
import { useLoad } from '../hooks/useLoad'

// "20 USD + 10%", "20 USD", "10%" or "Free": the parts of a fee that are set.
function feeText(flat: FareClass['cancel_fee_flat'], pct: FareClass['cancel_fee_pct'], currency: string): string {
  const parts = [Number(flat) > 0 && `${Number(flat)} ${currency}`, Number(pct) > 0 && `${Number(pct)}%`].filter(Boolean)
  return parts.length ? parts.join(' + ') : 'Free'
}

interface RemoveFareClassDialogProps {
  fareClass: FareClass
  onClose: () => void
  onRemoved: () => void
}

export function RemoveFareClassDialog({ fareClass, onClose, onRemoved }: RemoveFareClassDialogProps) {
  const api = usePricingApi()
  const currency = useLoad(() => api.getBaseCurrency(), 'currency')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = `${fareClass.code} · ${fareClass.name}`
  const unit = currency.data ?? ''

  async function confirmRemove() {
    setBusy(true)
    setError(null)
    try {
      await api.deleteFareClass(fareClass.id)
      onRemoved()
    } catch (e) {
      // FARE_CLASS_IN_USE explains which base fares to delete first.
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Dialog labelledBy="remove-class-title" className="pr-confirm" onClose={() => !busy && onClose()}>
      <div className="pr-sheet-handle" aria-hidden="true" />
      <div className="pr-confirm-head">
        <h2 id="remove-class-title">Remove {label}?</h2>
        <button type="button" className="pr-icon-button is-plain" aria-label="Close" disabled={busy} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="pr-warning">
        <strong>Removing hides the class from new quotes.</strong>
        <span>Existing bookings keep their frozen rules. You can add the class again at any time.</span>
      </div>
      <div className="pr-confirm-summary">
        <strong>{label}</strong>
        <span>
          {cabinLabel(fareClass.cabin)} •{' '}
          {fareClass.refundable ? `Refund ${feeText(fareClass.cancel_fee_flat, fareClass.cancel_fee_pct, unit)}` : 'No refund'} •{' '}
          {fareClass.changeable ? `Change ${feeText(fareClass.change_fee_flat, fareClass.change_fee_pct, unit)}` : 'No changes'}
        </span>
      </div>
      {error && (
        <div className="pr-callout is-error pr-confirm-error" role="alert">
          {error}
        </div>
      )}
      <div className="pr-confirm-actions">
        <button type="button" className="pr-button is-outline" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="pr-button is-danger-solid" disabled={busy} onClick={() => void confirmRemove()}>
          {busy ? 'Removing…' : 'Remove fare class'}
        </button>
      </div>
    </Dialog>
  )
}
