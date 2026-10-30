import { useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { cn } from '@staff-web/lib/utils'
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
    if (!changed.length) {
      setNotice({ text: 'No changes to save' })
      return
    }
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

      <section
        className="flex flex-col gap-3.5 rounded-(--pr-radius-card) border border-(--pr-border) bg-(--pr-surface) p-5"
        aria-labelledby="seat-fees-title"
      >
        {/* The h2 keeps its pr- class: the bare h2 rule in index.css is unlayered and beats Tailwind utilities. */}
        <div className="pr-card-head">
          <h2 id="seat-fees-title" className="pr-card-title">
            Seat-position fees
          </h2>
          <p className="pr-muted leading-[normal]">
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
          // Phone: Normal seat takes the full row, the other two share the next one.
          <div className="grid grid-cols-3 gap-x-4 gap-y-3 max-[800px]:grid-cols-2">
            {SEAT_TYPES.map((type) => {
              const inputId = `seat-fee-${type}`
              const error = errors[type]
              return (
                <div key={type} className={cn('flex min-w-0 flex-col gap-1.5', type === 'normal' && 'max-[800px]:col-span-2')}>
                  <Label htmlFor={inputId} className="text-[11px] leading-[normal] font-semibold text-(--pr-muted) uppercase">
                    {seatTypeLabel(type)}
                  </Label>
                  <span className="relative block">
                    {/* pr-12! because .pr-shell input is unlayered and sets the padding; is-changed is its highlight. */}
                    <Input
                      id={inputId}
                      className={cn('h-[42px] pr-12! tabular-nums', changed.includes(type) && 'is-changed')}
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
                    <span
                      className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-(--pr-muted)"
                      aria-hidden="true"
                    >
                      {currency.data}
                    </span>
                  </span>
                  {error && (
                    <span id={`${inputId}-error`} className="text-xs text-(--pr-danger)">
                      {error}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 max-[800px]:flex-col max-[800px]:items-stretch max-[800px]:gap-3">
          <p className="text-xs text-(--pr-muted)">Changes apply to the price simulator straight away.</p>
          {saveError && (
            <p className="text-xs text-(--pr-danger)" role="alert">
              {saveError}
            </p>
          )}
          <Button
            type="button"
            className="h-10 bg-(--pr-primary) px-6 text-[13px] font-semibold hover:bg-(--pr-primary-hover) max-[800px]:h-11 max-[800px]:w-full"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save seat fees'}
          </Button>
        </div>
      </section>
    </>
  )
}
