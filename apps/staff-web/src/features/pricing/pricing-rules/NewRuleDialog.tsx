import { useState, type FormEvent, type ReactNode } from 'react'
import { errorMessage, usePricingApi, type NewPricingRule, type PricingRule, type RuleGroup } from '../api'
import { Dialog } from '../components/Dialog'
import { groupLabel } from './describe'

// Limits mirror CreatePricingRuleDto and the service checks, so most mistakes are caught before the request.
const PCT_2DP = /^-?\d+(\.\d{1,2})?$/
const WHOLE = /^\d+$/
const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))),
)

const HINTS: Record<RuleGroup, string> = {
  urgency: 'Set a min or max days out (or both).',
  load: 'Set a min or max % of seats left (or both), from 0 to 100.',
  month: 'Pick the month of departure.',
  period: 'Set a start and end date; both days are included.',
}

type Field = 'name' | 'adjustment' | 'min' | 'max' | 'month' | 'start' | 'end'
type Form = Record<Field, string>

const EMPTY: Form = { name: '', adjustment: '', min: '', max: '', month: '', start: '', end: '' }

interface NewRuleDialogProps {
  group: RuleGroup
  nextPriority: number
  onClose: () => void
  onCreated: (rule: PricingRule) => void
}

export function NewRuleDialog({ group, nextPriority, onClose, onCreated }: NewRuleDialogProps) {
  const api = usePricingApi()
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function set(field: Field, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  // Returns the request body, or null after marking the fields that need fixing.
  function validate(): NewPricingRule | null {
    const found: Partial<Record<Field, string>> = {}
    const name = form.name.trim()
    if (!name) found.name = 'Enter a name'
    else if (name.length > 100) found.name = 'Up to 100 characters'

    const adjustment = form.adjustment.trim()
    if (!PCT_2DP.test(adjustment) || Number(adjustment) < -99.99 || Number(adjustment) > 9999.99) {
      found.adjustment = 'A % from -99.99 to 9999.99, up to 2 decimals'
    }

    const body: NewPricingRule = { rule_group: group, name, adjustment_pct: Number(adjustment) }
    const min = form.min.trim()
    const max = form.max.trim()

    switch (group) {
      case 'urgency':
      case 'load': {
        const isLoad = group === 'load'
        const valid = (value: string) => (isLoad ? PCT_2DP.test(value) && Number(value) >= 0 && Number(value) <= 100 : WHOLE.test(value))
        const message = isLoad ? '0 to 100, up to 2 decimals' : 'A whole number, 0 or more'
        if (min && !valid(min)) found.min = message
        if (max && !valid(max)) found.max = message
        if (!min && !max) found.min = 'Set min, max or both'
        else if (min && max && !found.min && !found.max && Number(min) > Number(max)) found.max = 'Must be at least the min'
        if (isLoad) {
          if (min) body.min_seats_left_pct = Number(min)
          if (max) body.max_seats_left_pct = Number(max)
        } else {
          if (min) body.min_days_out = Number(min)
          if (max) body.max_days_out = Number(max)
        }
        break
      }
      case 'month':
        if (!form.month) found.month = 'Pick a month'
        else body.month = Number(form.month)
        break
      case 'period':
        if (!form.start) found.start = 'Pick a start date'
        if (!form.end) found.end = 'Pick an end date'
        if (form.start && form.end && form.start > form.end) found.end = 'Must be on or after the start date'
        body.start_date = form.start
        body.end_date = form.end
        break
      default: {
        const unknown: never = group
        throw new Error(`Unknown rule group ${String(unknown)}`)
      }
    }

    setErrors(found)
    return Object.keys(found).length ? null : body
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaveError(null)
    const body = validate()
    if (!body) return
    setSaving(true)
    try {
      onCreated(await api.createPricingRule(body))
    } catch (e) {
      setSaveError(errorMessage(e))
      setSaving(false)
    }
  }

  function field(id: Field, label: string, input: ReactNode) {
    return (
      <div className="pr-field">
        <label htmlFor={`new-rule-${id}`} className="pr-fare-label">
          {label}
        </label>
        {input}
        {errors[id] && (
          <span id={`new-rule-${id}-error`} className="pr-field-error">
            {errors[id]}
          </span>
        )}
      </div>
    )
  }

  function textInput(id: Field, props: { inputMode?: 'decimal' | 'numeric'; type?: string; placeholder?: string } = {}) {
    return (
      <input
        id={`new-rule-${id}`}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        value={form[id]}
        disabled={saving}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `new-rule-${id}-error` : undefined}
        onChange={(e) => set(id, e.target.value)}
      />
    )
  }

  const label = groupLabel(group).toLowerCase()

  return (
    <Dialog labelledBy="new-rule-title" className="pr-confirm pr-form-dialog" onClose={() => !saving && onClose()}>
      <div className="pr-sheet-handle" aria-hidden="true" />
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="pr-confirm-head">
          <h2 id="new-rule-title">New {label} rule</h2>
          <button type="button" className="pr-icon-button pr-phone-only" aria-label="Close" disabled={saving} onClick={onClose}>
            ×
          </button>
        </div>

        {field('name', 'Name', textInput('name', { placeholder: group === 'urgency' ? 'e.g. Last-minute surge' : undefined }))}
        {field('adjustment', 'Adjustment (%, negative lowers)', textInput('adjustment', { inputMode: 'decimal', placeholder: 'e.g. 15' }))}

        {group === 'urgency' && (
          <div className="pr-fee-grid">
            {field('min', 'Min days out', textInput('min', { inputMode: 'numeric' }))}
            {field('max', 'Max days out', textInput('max', { inputMode: 'numeric' }))}
          </div>
        )}
        {group === 'load' && (
          <div className="pr-fee-grid">
            {field('min', 'Min % seats left', textInput('min', { inputMode: 'decimal' }))}
            {field('max', 'Max % seats left', textInput('max', { inputMode: 'decimal' }))}
          </div>
        )}
        {group === 'month' &&
          field(
            'month',
            'Month',
            <select
              id="new-rule-month"
              value={form.month}
              disabled={saving}
              aria-invalid={errors.month ? true : undefined}
              aria-describedby={errors.month ? 'new-rule-month-error' : undefined}
              onChange={(e) => set('month', e.target.value)}
            >
              <option value="">Pick a month</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>,
          )}
        {group === 'period' && (
          <div className="pr-fee-grid">
            {field('start', 'Start date', textInput('start', { type: 'date' }))}
            {field('end', 'End date', textInput('end', { type: 'date' }))}
          </div>
        )}

        <p className="pr-form-hint">
          {HINTS[group]} New rules get priority {nextPriority} and start active.
        </p>

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
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
