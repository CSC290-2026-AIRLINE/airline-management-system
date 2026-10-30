import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage, usePricingApi } from '../api'
import { Dialog } from '../components/Dialog'
import { useLoad } from '../hooks/useLoad'
import { TAX_FEE_CALC_TYPES, TAX_FEE_KINDS, useAddOnChargesApi, type TaxFee, type TaxFeeInput } from './api'
import { calcTypeLabel, taxKindLabel, taxValueLabel } from './labels'

type Selection = { mode: 'edit'; taxFee: TaxFee } | { mode: 'new' } | null

export function TaxFeesTab() {
  const api = useAddOnChargesApi()
  const pricingApi = usePricingApi()
  const list = useLoad(() => api.listTaxFees(), 'tax-fees')
  const currency = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const [selection, setSelection] = useState<Selection>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const loadError = list.error ?? currency.error

  function done(message: string) {
    setNotice(message)
    setSelection(null)
    list.reload()
  }

  // Turning a row off keeps it; the quote engine just skips inactive rows.
  async function toggleActive(taxFee: TaxFee) {
    setTogglingId(taxFee.id)
    setToggleError(null)
    setNotice(null)
    try {
      await api.updateTaxFee(taxFee.id, { is_active: !taxFee.is_active })
      list.reload()
    } catch (e) {
      setToggleError(`${taxFee.code}: ${errorMessage(e)}`)
    } finally {
      setTogglingId(null)
    }
  }

  const rows = list.data ?? []

  return (
    <section className="pr-card" aria-labelledby="tf-title">
      <div className="pr-card-toolbar">
        <h2 id="tf-title" className="pr-editor-title">
          Taxes and fees
        </h2>
        <span className="pr-muted">Added to every ticket. Percentages are taken on the price after the promo discount.</span>
        {notice && (
          <span className="pr-notice" role="status">
            {notice}
          </span>
        )}
      </div>

      {toggleError && (
        <div className="pr-callout is-error" role="alert">
          {toggleError}
        </div>
      )}

      {loadError ? (
        <div className="pr-callout is-error" role="alert">
          Could not load taxes and fees: {loadError}{' '}
          <button
            type="button"
            className="pr-link-button"
            onClick={() => {
              list.reload()
              currency.reload()
            }}
          >
            Retry
          </button>
        </div>
      ) : !list.data || !currency.data ? (
        <p className="pr-state">Loading taxes and fees…</p>
      ) : rows.length === 0 ? (
        <p className="pr-state">No taxes or fees yet. Add VAT, airport fees and surcharges here.</p>
      ) : (
        <div className="pr-table-wrap">
          <table className="pr-table is-stacked">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Kind</th>
                <th>Value</th>
                <th>Active</th>
                <th>
                  <span className="pr-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((taxFee) => (
                <tr key={taxFee.id} className={taxFee.is_active ? undefined : 'is-inactive'}>
                  <td className="pr-mono pr-cell-code">{taxFee.code}</td>
                  <td className="pr-cell-name">{taxFee.name}</td>
                  <td className="pr-cell-cabin">
                    {taxKindLabel(taxFee.kind)} · {calcTypeLabel(taxFee.calc_type)}
                  </td>
                  <td className="pr-cell-amount">{taxValueLabel(taxFee.calc_type, taxFee.value, currency.data!)}</td>
                  <td>
                    <label className="pr-toggle">
                      <input
                        type="checkbox"
                        checked={taxFee.is_active}
                        disabled={togglingId === taxFee.id}
                        onChange={() => void toggleActive(taxFee)}
                      />
                      <span>{taxFee.is_active ? 'On' : 'Off'}</span>
                      <span className="pr-visually-hidden"> ({taxFee.code})</span>
                    </label>
                  </td>
                  <td className="pr-row-actions">
                    <button
                      type="button"
                      className="pr-button is-outline is-small"
                      onClick={() => {
                        setNotice(null)
                        setSelection({ mode: 'edit', taxFee })
                      }}
                    >
                      Edit<span className="pr-visually-hidden"> {taxFee.code}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pr-card-footer">
        <button
          type="button"
          className="pr-button is-outline pr-add-button"
          onClick={() => {
            setNotice(null)
            setSelection({ mode: 'new' })
          }}
        >
          + Add tax or fee
        </button>
      </div>

      {selection && (
        <Dialog labelledBy="tf-editor-title" onClose={() => setSelection(null)}>
          <TaxFeeForm
            taxFee={selection.mode === 'edit' ? selection.taxFee : null}
            currency={currency.data ?? 'THB'}
            onSaved={(saved) => done(`Saved ${saved.code}`)}
            onRemoved={() => done('Tax or fee removed')}
            onClose={() => setSelection(null)}
          />
        </Dialog>
      )}
    </section>
  )
}

interface FormState {
  code: string
  name: string
  kind: TaxFeeInput['kind']
  calc_type: TaxFeeInput['calc_type']
  value: string
  is_active: boolean
}

type FieldErrors = Partial<Record<keyof FormState, string>>

const EMPTY: FormState = { code: '', name: '', kind: 'tax', calc_type: 'flat', value: '', is_active: true }
const VALUE = /^\d+(\.\d{1,2})?$/

// Same rules as CreateTaxFeeDto and the TAX_FEE_PCT_TOO_HIGH check on the backend, which validates again.
function validate(form: FormState): { input?: TaxFeeInput; errors: FieldErrors } {
  const errors: FieldErrors = {}
  if (!/^[A-Z0-9_]{1,20}$/.test(form.code)) errors.code = '1–20 capital letters, digits or _ (e.g. VAT, APT_FEE)'
  if (!form.name.trim()) errors.name = 'Required'
  else if (form.name.length > 100) errors.name = 'At most 100 characters'
  if (!VALUE.test(form.value)) errors.value = '0 or more, up to 2 decimals'
  else if (form.calc_type === 'pct' && Number(form.value) > 100) errors.value = 'A percentage cannot be more than 100'
  if (Object.keys(errors).length) return { errors }
  return {
    errors,
    input: {
      code: form.code,
      name: form.name.trim(),
      kind: form.kind,
      calc_type: form.calc_type,
      value: Number(form.value),
      is_active: form.is_active,
    },
  }
}

interface TaxFeeFormProps {
  taxFee: TaxFee | null // null = adding a new one
  currency: string
  onSaved: (taxFee: TaxFee) => void
  onRemoved: () => void
  onClose: () => void
}

function TaxFeeForm({ taxFee, currency, onSaved, onRemoved, onClose }: TaxFeeFormProps) {
  const api = useAddOnChargesApi()
  const [form, setForm] = useState<FormState>(
    taxFee
      ? {
          code: taxFee.code,
          name: taxFee.name,
          kind: taxFee.kind,
          calc_type: taxFee.calc_type,
          value: String(Number(taxFee.value)),
          is_active: taxFee.is_active,
        }
      : EMPTY,
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const { input, errors: found } = validate(form)
    setErrors(found)
    setServerError(null)
    if (!input) return
    setBusy(true)
    try {
      onSaved(taxFee ? await api.updateTaxFee(taxFee.id, input) : await api.createTaxFee(input))
    } catch (error) {
      // A duplicate code is shown on the code field itself; anything else goes in the callout.
      if (error instanceof ApiError && error.code === 'TAX_FEE_CODE_TAKEN') setErrors({ code: error.message })
      else if (error instanceof ApiError && error.code === 'TAX_FEE_PCT_TOO_HIGH') setErrors({ value: error.message })
      else setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!taxFee || !window.confirm(`Remove ${taxFee.code} · ${taxFee.name}?`)) return
    setBusy(true)
    setServerError(null)
    try {
      await api.deleteTaxFee(taxFee.id)
      onRemoved()
    } catch (error) {
      setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  function fieldProps(field: keyof FormState) {
    return {
      id: `tf-${field}`,
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': errors[field] ? `tf-${field}-error` : undefined,
    }
  }

  function fieldError(field: keyof FormState) {
    return errors[field] ? (
      <span id={`tf-${field}-error`} className="pr-field-error">
        {errors[field]}
      </span>
    ) : null
  }

  return (
    <div className="pr-editor">
      <div className="pr-sheet-handle" aria-hidden="true" />
      <div className="pr-editor-head">
        <h2 id="tf-editor-title" className="pr-editor-title is-sheet">
          {taxFee ? `${taxFee.code} · ${taxFee.name}` : 'Add tax or fee'}
        </h2>
        <button type="button" className="pr-icon-button" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="pr-field">
          <label htmlFor="tf-code">Code (unique, e.g. VAT, APT_FEE)</label>
          <input {...fieldProps('code')} value={form.code} maxLength={20} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          {fieldError('code')}
        </div>

        <div className="pr-field">
          <label htmlFor="tf-name">Name</label>
          <input {...fieldProps('name')} value={form.name} maxLength={100} onChange={(e) => set('name', e.target.value)} />
          {fieldError('name')}
        </div>

        <div className="pr-field">
          <label htmlFor="tf-kind">Kind</label>
          <select id="tf-kind" value={form.kind} onChange={(e) => set('kind', e.target.value as FormState['kind'])}>
            {TAX_FEE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {taxKindLabel(kind)}
              </option>
            ))}
          </select>
          <span className="pr-help">Taxes and surcharges are collected for others, so the finance report leaves them out of revenue.</span>
        </div>

        <div className="pr-field">
          <label htmlFor="tf-calc_type">Charged as</label>
          <select id="tf-calc_type" value={form.calc_type} onChange={(e) => set('calc_type', e.target.value as FormState['calc_type'])}>
            {TAX_FEE_CALC_TYPES.map((calcType) => (
              <option key={calcType} value={calcType}>
                {calcTypeLabel(calcType)}
              </option>
            ))}
          </select>
        </div>

        <div className="pr-field">
          <label htmlFor="tf-value">Value ({form.calc_type === 'pct' ? '%' : currency})</label>
          <input {...fieldProps('value')} inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value)} />
          {fieldError('value')}
        </div>

        <div className="pr-checks">
          <label>
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            Active (added to new quotes)
          </label>
        </div>

        {serverError && (
          <div className="pr-callout is-error" role="alert">
            {serverError}
          </div>
        )}

        <div className="pr-actions">
          <button type="submit" className="pr-button is-primary" disabled={busy}>
            {busy ? 'Saving…' : taxFee ? 'Save' : 'Add'}
          </button>
          {taxFee && (
            <button type="button" className="pr-button is-danger" disabled={busy} onClick={() => void handleRemove()}>
              Remove
            </button>
          )}
          <button type="button" className="pr-button is-outline" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
