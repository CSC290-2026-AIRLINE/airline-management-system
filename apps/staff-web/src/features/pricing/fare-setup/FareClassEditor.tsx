import { useState, type FormEvent } from 'react'
import { CABINS, errorMessage, usePricingApi, type FareClass, type FareClassInput } from '../api'
import { cabinLabel } from '../format'
import { RemoveFareClassDialog } from './RemoveFareClassDialog'

// Form state keeps raw input text so a half-typed number is not lost; it is parsed on submit.
interface FormState {
  code: string
  name: string
  cabin: FareClassInput['cabin']
  min_advance_purchase_days: string
  refundable: boolean
  changeable: boolean
  cancel_fee_flat: string
  cancel_fee_pct: string
  change_fee_flat: string
  change_fee_pct: string
  is_active: boolean
}

type FieldErrors = Partial<Record<keyof FormState, string>>

const EMPTY: FormState = {
  code: '',
  name: '',
  cabin: 'economy',
  min_advance_purchase_days: '0',
  refundable: false,
  changeable: false,
  cancel_fee_flat: '0',
  cancel_fee_pct: '0',
  change_fee_flat: '0',
  change_fee_pct: '0',
  is_active: true,
}

// Fields are copied one by one: the API row also has id, created_at, updated_at and deleted_at, which the backend's
// whitelisting ValidationPipe rejects if they are sent back.
function toForm(fareClass: FareClass): FormState {
  return {
    code: fareClass.code,
    name: fareClass.name,
    cabin: fareClass.cabin,
    refundable: fareClass.refundable,
    changeable: fareClass.changeable,
    is_active: fareClass.is_active,
    min_advance_purchase_days: String(fareClass.min_advance_purchase_days),
    cancel_fee_flat: String(Number(fareClass.cancel_fee_flat)),
    cancel_fee_pct: String(Number(fareClass.cancel_fee_pct)),
    change_fee_flat: String(Number(fareClass.change_fee_flat)),
    change_fee_pct: String(Number(fareClass.change_fee_pct)),
  }
}

const MONEY = /^\d+(\.\d{1,2})?$/

// Same rules as CreateFareClassDto and the FARE_RULE_INVALID check on the backend, which validates again.
function validate(form: FormState): { input?: FareClassInput; errors: FieldErrors } {
  const errors: FieldErrors = {}
  if (!/^[A-Z0-9]{1,3}$/.test(form.code)) errors.code = '1–3 uppercase letters or digits'
  if (!form.name.trim()) errors.name = 'Required'
  else if (form.name.length > 100) errors.name = 'At most 100 characters'
  if (!/^\d+$/.test(form.min_advance_purchase_days)) errors.min_advance_purchase_days = 'A whole number, 0 or more'
  for (const field of ['cancel_fee_flat', 'cancel_fee_pct', 'change_fee_flat', 'change_fee_pct'] as const) {
    if (!MONEY.test(form[field])) errors[field] = '0 or more, up to 2 decimals'
    else if (field.endsWith('_pct') && Number(form[field]) > 100) errors[field] = 'At most 100'
  }
  if (Object.keys(errors).length) return { errors }

  return {
    errors,
    input: {
      code: form.code,
      cabin: form.cabin,
      refundable: form.refundable,
      changeable: form.changeable,
      is_active: form.is_active,
      name: form.name.trim(),
      min_advance_purchase_days: Number(form.min_advance_purchase_days),
      cancel_fee_flat: Number(form.cancel_fee_flat),
      cancel_fee_pct: Number(form.cancel_fee_pct),
      change_fee_flat: Number(form.change_fee_flat),
      change_fee_pct: Number(form.change_fee_pct),
    },
  }
}

// panel: desktop side panel. page: phone, the editor replaces the list. dialog / sheet: the add pop-up on desktop / phone.
export type EditorVariant = 'panel' | 'page' | 'dialog' | 'sheet'

interface FareClassEditorProps {
  fareClass: FareClass | null // null = adding a new class
  variant: EditorVariant
  onSaved: (fareClass: FareClass) => void
  onRemoved: () => void
  onClose: () => void
}

export function FareClassEditor({ fareClass, variant, onSaved, onRemoved, onClose }: FareClassEditorProps) {
  const api = usePricingApi()
  const [form, setForm] = useState<FormState>(fareClass ? toForm(fareClass) : EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  // A fee only makes sense when the action is allowed, so unticking clears the matching fees.
  function setAllowed(field: 'refundable' | 'changeable', allowed: boolean) {
    const fees =
      field === 'refundable' ? (['cancel_fee_flat', 'cancel_fee_pct'] as const) : (['change_fee_flat', 'change_fee_pct'] as const)
    setForm((current) => ({ ...current, [field]: allowed, ...(!allowed && { [fees[0]]: '0', [fees[1]]: '0' }) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const { input, errors: found } = validate(form)
    setErrors(found)
    setServerError(null)
    if (!input) return
    setBusy(true)
    try {
      onSaved(fareClass ? await api.updateFareClass(fareClass.id, input) : await api.createFareClass(input))
    } catch (error) {
      setServerError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function fieldProps(field: keyof FormState) {
    return {
      id: `fc-${field}`,
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': errors[field] ? `fc-${field}-error` : undefined,
    }
  }

  function fieldError(field: keyof FormState) {
    return errors[field] ? (
      <span id={`fc-${field}-error`} className="pr-field-error">
        {errors[field]}
      </span>
    ) : null
  }

  const title = fareClass ? `${fareClass.code} · ${fareClass.name}` : 'New fare class'
  const closeButton = (
    <button type="button" className="pr-icon-button" onClick={onClose} aria-label={fareClass ? 'Close editor' : 'Close dialog'}>
      ×
    </button>
  )

  const formBody = (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      {/* The add pop-up puts code and name on one row; the editor stacks them. */}
      <div className={fareClass ? undefined : 'pr-code-name-row'}>
        <div className="pr-field">
          <label htmlFor="fc-code">{fareClass ? 'Code (unique, e.g. Y, M, J)' : 'Code'}</label>
          <input {...fieldProps('code')} value={form.code} maxLength={3} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          {fieldError('code')}
        </div>

        <div className="pr-field">
          <label htmlFor="fc-name">Name</label>
          <input {...fieldProps('name')} value={form.name} maxLength={100} onChange={(e) => set('name', e.target.value)} />
          {fieldError('name')}
        </div>
      </div>

      <div className="pr-field">
        <label htmlFor="fc-cabin">Cabin</label>
        <select id="fc-cabin" value={form.cabin} onChange={(e) => set('cabin', e.target.value as FormState['cabin'])}>
          {CABINS.map((cabin) => (
            <option key={cabin} value={cabin}>
              {cabinLabel(cabin)}
            </option>
          ))}
        </select>
      </div>

      <div className="pr-field">
        <label htmlFor="fc-min_advance_purchase_days">Minimum advance purchase (days)</label>
        <input
          {...fieldProps('min_advance_purchase_days')}
          inputMode="numeric"
          value={form.min_advance_purchase_days}
          onChange={(e) => set('min_advance_purchase_days', e.target.value)}
        />
        {fieldError('min_advance_purchase_days')}
      </div>

      <div className="pr-checks">
        <label>
          <input type="checkbox" checked={form.refundable} onChange={(e) => setAllowed('refundable', e.target.checked)} />
          Refundable
        </label>
        <label>
          <input type="checkbox" checked={form.changeable} onChange={(e) => setAllowed('changeable', e.target.checked)} />
          Changeable
        </label>
        <label>
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          Active
        </label>
      </div>

      <div className="pr-fee-grid">
        {(
          [
            ['cancel_fee_flat', 'Cancel fee (flat)', form.refundable],
            ['cancel_fee_pct', 'Cancel fee (%)', form.refundable],
            ['change_fee_flat', 'Change fee (flat)', form.changeable],
            ['change_fee_pct', 'Change fee (%)', form.changeable],
          ] as const
        ).map(([field, label, enabled]) => (
          <div key={field} className="pr-field">
            <label htmlFor={`fc-${field}`}>{label}</label>
            <input
              {...fieldProps(field)}
              inputMode="decimal"
              value={form[field]}
              disabled={!enabled}
              title={enabled ? undefined : `Tick ${field.startsWith('cancel') ? 'Refundable' : 'Changeable'} to set this fee`}
              onChange={(e) => set(field, e.target.value)}
            />
            {fieldError(field)}
          </div>
        ))}
      </div>

      {fareClass && (
        <p className="pr-help">
          Fee = flat amount + percentage of the quote total, capped at the total. Quotes keep a frozen copy of these rules, so edits never
          change a booking already made.
        </p>
      )}

      {serverError && (
        <div className="pr-callout is-error" role="alert">
          {serverError}
        </div>
      )}

      {fareClass ? (
        <div className="pr-actions">
          <button type="submit" className="pr-button is-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save fare class'}
          </button>
          <button type="button" className="pr-button is-danger" disabled={busy} onClick={() => setRemoving(true)}>
            Remove fare class
          </button>
        </div>
      ) : (
        <div className="pr-confirm-actions">
          <button type="button" className="pr-button is-outline" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pr-button is-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add fare class'}
          </button>
        </div>
      )}

      {removing && fareClass && <RemoveFareClassDialog fareClass={fareClass} onClose={() => setRemoving(false)} onRemoved={onRemoved} />}
    </form>
  )

  switch (variant) {
    case 'panel':
      return (
        <section className="pr-card pr-editor" aria-labelledby="fc-editor-title">
          <div className="pr-editor-head">
            <div>
              <p className="pr-eyebrow">{fareClass ? 'Editing' : 'New fare class'}</p>
              <h2 id="fc-editor-title" className="pr-editor-title">
                {title}
              </h2>
            </div>
            {closeButton}
          </div>
          {formBody}
        </section>
      )
    case 'page':
      return (
        <section className="pr-editor-page" aria-labelledby="fc-editor-title">
          <button type="button" className="pr-back-link" onClick={onClose}>
            ‹ Fare classes
          </button>
          <p className="pr-eyebrow">{fareClass ? 'Editing' : 'New fare class'}</p>
          <h2 id="fc-editor-title" className="pr-editor-page-title">
            {title}
          </h2>
          <div className="pr-card pr-editor">{formBody}</div>
        </section>
      )
    case 'dialog':
    case 'sheet':
      return (
        <div className="pr-editor">
          <div className="pr-sheet-handle" aria-hidden="true" />
          <div className="pr-editor-head">
            <h2 id="fc-editor-title" className="pr-editor-title">
              {title}
            </h2>
            {variant === 'sheet' && closeButton}
          </div>
          {formBody}
        </div>
      )
    default: {
      const unknown: never = variant
      return unknown
    }
  }
}
