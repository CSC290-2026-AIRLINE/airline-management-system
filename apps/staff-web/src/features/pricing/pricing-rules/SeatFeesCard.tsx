import { useEffect, useState } from 'react'
import { errorMessage, SEAT_TYPES, usePricingApi, type SeatType } from '../api'
import { useLoad } from '../hooks/useLoad'
import { seatTypeLabel } from './describe'

const AMOUNT = /^\d+(\.\d{1,2})?$/
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)
const NOTICE_MS = 2000
// The design edits economy only; other cabins can be added as a cabin picker later.
const CABIN = 'economy'

export function SeatFeesCard({ onChanged }: { onChanged: () => void }) {
  const api = usePricingApi()
  const seatFees = useLoad(() => api.listSeatFees(), 'seat-fees')
  const currency = useLoad(() => api.getBaseCurrency(), 'currency')
  const [edits, setEdits] = useState<Partial<Record<SeatType, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<SeatType, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string } | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const savedFee = (seatType: SeatType) => seatFees.data?.find((fee) => fee.cabin === CABIN && fee.seat_type === seatType)
  const savedText = (seatType: SeatType) => {
    const fee = savedFee(seatType)
    return fee ? String(Number(fee.amount)) : ''
  }
  const changed = SEAT_TYPES.filter((type) => edits[type] !== undefined && edits[type].trim() !== savedText(type))

  async function save() {
    setSaveError(null)
    const invalid: Partial<Record<SeatType, string>> = {}
    for (const type of changed) {
      const value = edits[type]?.trim() ?? ''
      if (!AMOUNT.test(value) || Number(value) > MAX_AMOUNT) invalid[type] = 'Enter 0 or more, up to 2 decimals'
    }
    if (Object.keys(invalid).length) {
      setErrors(invalid)
      return
    }

    setSaving(true)
    const results = await Promise.allSettled(
      changed.map((type) => {
        const amount = Number(edits[type])
        const fee = savedFee(type)
        return fee ? api.updateSeatFee(fee.id, amount) : api.createSeatFee(CABIN, type, amount)
      }),
    )
    const failed: Partial<Record<SeatType, string>> = {}
    results.forEach((result, index) => {
      if (result.status === 'rejected') failed[changed[index]] = errorMessage(result.reason)
    })
    setEdits((current) => Object.fromEntries(Object.entries(current).filter(([type]) => type in failed)))
    setErrors(failed)
    setSaving(false)
    seatFees.reload()
    onChanged()
    if (Object.keys(failed).length) setSaveError('Some seat fees could not be saved. Fix the marked fields and save again.')
    else setNotice({ text: 'Seat fees saved' })
  }

  const loading = !seatFees.data || !currency.data
  const loadError = seatFees.error ?? currency.error

  return (
    <>
      <div role="status" aria-live="polite" className="pr-banner-slot">
        {notice && <p className="pr-banner is-success">{notice.text}</p>}
      </div>

      <section className="pr-card" aria-labelledby="seat-fees-title">
        <div className="pr-card-head">
          <h2 id="seat-fees-title" className="pr-card-title">
            Seat-position fees
          </h2>
          <p className="pr-muted">
            A flat fee added after the rules when the passenger picks a seat. Economy cabin shown; seat types come from the aircraft seat
            map.
          </p>
        </div>

        {loadError ? (
          <div className="pr-callout is-error" role="alert">
            Could not load seat fees: {loadError}{' '}
            <button
              type="button"
              className="pr-link-button"
              onClick={() => {
                seatFees.reload()
                currency.reload()
              }}
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="pr-state">Loading seat fees…</p>
        ) : (
          <div className="pr-seat-fee-grid">
            {SEAT_TYPES.map((type) => {
              const inputId = `seat-fee-${type}`
              const error = errors[type]
              return (
                <div key={type}>
                  <label htmlFor={inputId} className="pr-fare-label">
                    {seatTypeLabel(type)}
                  </label>
                  <span className="pr-amount-field">
                    <input
                      id={inputId}
                      className={`pr-fare-input${changed.includes(type) ? ' is-changed' : ''}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={edits[type] ?? savedText(type)}
                      disabled={saving}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${inputId}-error` : undefined}
                      onChange={(e) => {
                        setEdits((current) => ({ ...current, [type]: e.target.value }))
                        setErrors((current) => ({ ...current, [type]: undefined }))
                      }}
                    />
                    <span className="pr-amount-suffix" aria-hidden="true">
                      {currency.data}
                    </span>
                  </span>
                  {error && (
                    <span id={`${inputId}-error`} className="pr-field-error pr-matrix-error">
                      {error}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="pr-card-footer pr-matrix-footer">
          <p className="pr-muted">Changes apply to new quotes and seat changes straight away.</p>
          {saveError && (
            <p className="pr-field-error" role="alert">
              {saveError}
            </p>
          )}
          <button type="button" className="pr-button is-primary" disabled={saving || !changed.length} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save seat fees'}
          </button>
        </div>
      </section>
    </>
  )
}
