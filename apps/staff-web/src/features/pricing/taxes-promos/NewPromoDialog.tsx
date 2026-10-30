import { useState, type FormEvent, type ReactNode } from 'react'
import { errorMessage, usePricingApi, type NewPromoCode, type PromoCode, type PromoKind } from '../api'
import { Dialog } from '../components/Dialog'
import { kindLabel } from './promo-format'

// Limits mirror CreatePromoCodeDto and the service checks, which validate again.
const CODE = /^[A-Z0-9_]{1,20}$/
const AMOUNT = /^\d+(\.\d{1,2})?$/
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)

type DiscountType = 'pct' | 'amount'
type Field = 'code' | 'discount' | 'validFrom' | 'validTo' | 'maxUses'

interface Form {
  code: string
  kind: PromoKind
  discountType: DiscountType
  discount: string
  validFrom: string // YYYY-MM-DD
  validTo: string
  maxUses: string
}

const EMPTY: Form = { code: '', kind: 'promo', discountType: 'pct', discount: '', validFrom: '', validTo: '', maxUses: '' }

// The form picks whole days in the staff member's timezone: from the start of the first day to the end of the last.
// The backend's valid_to is exclusive, so that end is midnight at the start of the next day.
function startOfDay(date: string, addDays = 0): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day + addDays).toISOString()
}

interface NewPromoDialogProps {
  currency: string
  onClose: () => void
  onCreated: (promo: PromoCode) => void
}

export function NewPromoDialog({ currency, onClose, onCreated }: NewPromoDialogProps) {
  const api = usePricingApi()
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function set<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  // Returns the request body, or null after marking the fields that need fixing.
  function validate(): NewPromoCode | null {
    const found: Partial<Record<Field, string>> = {}
    if (!CODE.test(form.code)) found.code = '1–20 uppercase letters, digits or _'

    const discount = Number(form.discount)
    const isPercent = form.discountType === 'pct'
    if (!AMOUNT.test(form.discount) || discount <= 0 || discount > (isPercent ? 100 : MAX_AMOUNT)) {
      found.discount = isPercent ? 'Above 0, up to 100' : 'Above 0, up to 2 decimals'
    }

    if (!form.validFrom) found.validFrom = 'Pick a date'
    if (!form.validTo) found.validTo = 'Pick a date'
    if (form.validFrom && form.validTo && form.validFrom > form.validTo) found.validTo = 'Must be on or after the start'

    if (form.maxUses && (!/^\d+$/.test(form.maxUses) || Number(form.maxUses) < 1)) found.maxUses = 'A whole number, 1 or more'

    setErrors(found)
    if (Object.keys(found).length) return null
    return {
      code: form.code,
      kind: form.kind,
      ...(isPercent ? { discount_pct: discount } : { discount_amount: discount }),
      valid_from: startOfDay(form.validFrom),
      valid_to: startOfDay(form.validTo, 1),
      ...(form.maxUses && { max_uses: Number(form.maxUses) }),
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaveError(null)
    const body = validate()
    if (!body) return
    setSaving(true)
    try {
      onCreated(await api.createPromoCode(body))
    } catch (e) {
      setSaveError(errorMessage(e))
      setSaving(false)
    }
  }

  function field(id: Field, label: string, input: ReactNode) {
    return (
      <div className="pr-field">
        <label htmlFor={`promo-${id}`}>{label}</label>
        {input}
        {errors[id] && (
          <span id={`promo-${id}-error`} className="pr-field-error">
            {errors[id]}
          </span>
        )}
      </div>
    )
  }

  function inputProps(id: Field) {
    return {
      id: `promo-${id}`,
      disabled: saving,
      'aria-invalid': errors[id] ? true : undefined,
      'aria-describedby': errors[id] ? `promo-${id}-error` : undefined,
    }
  }

  return (
    <Dialog labelledBy="promo-title" className="pr-confirm pr-form-dialog pr-form-sheet" onClose={() => !saving && onClose()}>
      <div className="pr-sheet-handle" aria-hidden="true" />
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="pr-confirm-head">
          <h2 id="promo-title">New promo or corporate code</h2>
          <button type="button" className="pr-icon-button pr-phone-only" aria-label="Close" disabled={saving} onClick={onClose}>
            ×
          </button>
        </div>

        {field(
          'code',
          'Code',
          <input
            {...inputProps('code')}
            value={form.code}
            maxLength={20}
            placeholder="e.g. SPRING15"
            onChange={(e) => set('code', e.target.value.toUpperCase())}
          />,
        )}

        <div className="pr-promo-row">
          <div className="pr-field">
            <label htmlFor="promo-kind">Kind</label>
            <select id="promo-kind" value={form.kind} disabled={saving} onChange={(e) => set('kind', e.target.value as PromoKind)}>
              {(['promo', 'corporate'] as const).map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabel(kind)}
                </option>
              ))}
            </select>
          </div>
          <div className="pr-field">
            <label htmlFor="promo-type">Discount type</label>
            <select
              id="promo-type"
              value={form.discountType}
              disabled={saving}
              onChange={(e) => set('discountType', e.target.value as DiscountType)}
            >
              <option value="pct">Percentage</option>
              <option value="amount">Fixed amount</option>
            </select>
          </div>
          {field(
            'discount',
            `Discount (${form.discountType === 'pct' ? '%' : currency})`,
            <input
              {...inputProps('discount')}
              inputMode="decimal"
              value={form.discount}
              onChange={(e) => set('discount', e.target.value)}
            />,
          )}
        </div>

        <div className="pr-sim-row">
          {field(
            'validFrom',
            'Valid from',
            <input {...inputProps('validFrom')} type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />,
          )}
          {field(
            'validTo',
            'Valid to',
            <input {...inputProps('validTo')} type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} />,
          )}
        </div>

        {field(
          'maxUses',
          'Max uses (empty = unlimited)',
          <input {...inputProps('maxUses')} inputMode="numeric" value={form.maxUses} onChange={(e) => set('maxUses', e.target.value)} />,
        )}

        <p className="pr-form-hint">New codes start active. A future start date shows as Not started.</p>

        {saveError && (
          <div className="pr-callout is-error pr-confirm-error" role="alert">
            {saveError}
          </div>
        )}

        <div className="pr-confirm-actions">
          <button type="button" className="pr-button is-outline" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pr-button is-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save code'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
