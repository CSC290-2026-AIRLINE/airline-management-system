import { useState, type FormEvent } from 'react'
import { CABINS, errorMessage, usePricingApi, type Cabin } from '../api'
import { cabinLabel, formatMoney } from '../format'
import { useLoad } from '../hooks/useLoad'
import { SEAT_TYPES, useAddOnChargesApi, type SeatFee, type SeatType } from './api'
import { seatTypeLabel } from './labels'

const AMOUNT = /^\d+(\.\d{1,2})?$/ // CreateSeatFeeDto: 0 or more, up to 2 decimals
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)

// Cabins down the side, seat types across the top. An empty cell means no fee is set for that pair.
export function SeatFeesTab() {
  const api = useAddOnChargesApi()
  const pricingApi = usePricingApi()
  const seatFees = useLoad(() => api.listSeatFees(), 'seat-fees')
  const currency = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const loadError = seatFees.error ?? currency.error

  return (
    <section className="pr-card" aria-labelledby="sf-title">
      <div className="pr-card-toolbar">
        <h2 id="sf-title" className="pr-editor-title">
          Seat fees
        </h2>
        <span className="pr-muted">Extra charge for a seat type in a cabin, the same on every flight. Click a cell to set it.</span>
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
      ) : !seatFees.data || !currency.data ? (
        <p className="pr-state">Loading seat fees…</p>
      ) : (
        <div className="pr-table-wrap">
          <table className="pr-table pr-seat-grid">
            <thead>
              <tr>
                <th scope="col">Cabin</th>
                {SEAT_TYPES.map((seatType) => (
                  <th key={seatType} scope="col">
                    {seatTypeLabel(seatType)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CABINS.map((cabin) => (
                <tr key={cabin}>
                  <th scope="row">{cabinLabel(cabin)}</th>
                  {SEAT_TYPES.map((seatType) => {
                    const seatFee = seatFees.data?.find((fee) => fee.cabin === cabin && fee.seat_type === seatType)
                    return (
                      <td key={`${seatType}:${seatFee?.id ?? 'none'}:${seatFee?.amount ?? ''}`}>
                        <SeatFeeCell
                          cabin={cabin}
                          seatType={seatType}
                          seatFee={seatFee}
                          currency={currency.data!}
                          onChanged={seatFees.reload}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

interface SeatFeeCellProps {
  cabin: Cabin
  seatType: SeatType
  seatFee?: SeatFee
  currency: string
  onChanged: () => void
}

function SeatFeeCell({ cabin, seatType, seatFee, currency, onChanged }: SeatFeeCellProps) {
  const api = useAddOnChargesApi()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(seatFee ? String(Number(seatFee.amount)) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = `sf-${cabin}-${seatType}`
  const label = `${cabinLabel(cabin)} ${seatTypeLabel(seatType).toLowerCase()}`

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged() // the grid reloads and remounts this cell with the saved value
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!AMOUNT.test(amount) || Number(amount) > MAX_AMOUNT) {
      setError('0 or more, up to 2 decimals')
      return
    }
    void run(() => (seatFee ? api.updateSeatFee(seatFee.id, Number(amount)) : api.createSeatFee(cabin, seatType, Number(amount))))
  }

  function cancel() {
    setAmount(seatFee ? String(Number(seatFee.amount)) : '')
    setError(null)
    setEditing(false)
  }

  function handleRemove() {
    if (!seatFee || !window.confirm(`Remove the ${label} seat fee?`)) return
    void run(() => api.deleteSeatFee(seatFee.id))
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`pr-cell-button${seatFee ? '' : ' is-empty'}`}
        aria-label={`${label}: ${seatFee ? formatMoney(seatFee.amount, currency) : 'no fee set'}. Edit`}
        onClick={() => setEditing(true)}
      >
        {seatFee ? formatMoney(seatFee.amount, currency) : 'Not set'}
      </button>
    )
  }

  return (
    <form className="pr-cell-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId} className="pr-visually-hidden">
        Seat fee for {label} in {currency}
      </label>
      <input
        id={inputId}
        className="pr-amount-input"
        inputMode="decimal"
        placeholder="0.00"
        autoFocus
        value={amount}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
        }}
      />
      <div className="pr-row-actions">
        <button type="submit" className="pr-button is-primary is-small" disabled={busy}>
          {seatFee ? 'Save' : 'Add'}
        </button>
        {seatFee && (
          <button type="button" className="pr-button is-danger is-small" disabled={busy} onClick={handleRemove}>
            Remove
          </button>
        )}
        <button type="button" className="pr-button is-outline is-small" disabled={busy} onClick={cancel}>
          Cancel
        </button>
      </div>
      {error && (
        <span id={`${inputId}-error`} className="pr-field-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
