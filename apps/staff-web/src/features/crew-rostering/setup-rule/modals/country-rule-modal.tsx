import { useState } from 'react'
import { formatHours } from '../types/format'
import { EMPTY_COUNTRY_LIMIT_FORM, hasErrors, toCountryLimitForm, validateCountryLimit } from '../types/rule-form'
import type { CountryLimit, CountryLimitErrors, CountryLimitInput, DefaultLimits } from '../types/types'
import { BaseModalOverlay, Button, InputField, SelectDropdown } from '../../shared/ui'

/**
 * Add and edit share one form because they share every field; `mode` only changes
 * the heading, the submit label and whether the destination is locked.
 *
 * The submit button lives in the footer, outside the `<form>`, and is tied to it
 * by `id`. It carries no `onClick` of its own: a submit button fires both, and
 * the click would save the rule twice.
 */
const FORM_ID = 'country-rule-form'

export function AddCountryRuleModal({
  defaults,
  countries,
  takenCountries,
  onCancel,
  onSubmit,
}: {
  defaults: DefaultLimits
  countries: readonly { name: string }[]
  takenCountries: readonly string[]
  onCancel: () => void
  onSubmit: (input: CountryLimitInput) => void
}) {
  return (
    <CountryRuleForm
      mode="add"
      defaults={defaults}
      countries={countries}
      takenCountries={takenCountries}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  )
}

export function EditCountryRuleModal({
  limit,
  defaults,
  countries,
  takenCountries,
  onCancel,
  onSubmit,
}: {
  limit: CountryLimit
  defaults: DefaultLimits
  countries: readonly { name: string }[]
  takenCountries: readonly string[]
  onCancel: () => void
  onSubmit: (input: CountryLimitInput) => void
}) {
  return (
    <CountryRuleForm
      mode="edit"
      defaults={defaults}
      countries={countries}
      takenCountries={takenCountries}
      limit={limit}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  )
}

function CountryRuleForm({
  mode,
  defaults,
  countries,
  takenCountries,
  limit = null,
  onCancel,
  onSubmit,
}: {
  mode: 'add' | 'edit'
  defaults: DefaultLimits
  countries: readonly { name: string }[]
  takenCountries: readonly string[]
  limit?: CountryLimit | null
  onCancel: () => void
  onSubmit: (input: CountryLimitInput) => void
}) {
  const [form, setForm] = useState<CountryLimitInput>(() =>
    limit
      ? toCountryLimitForm(limit)
      : { ...EMPTY_COUNTRY_LIMIT_FORM, minRestHours: String(defaults.minRestHours), maxDutyHours: String(defaults.maxDutyHours) },
  )
  const [errors, setErrors] = useState<CountryLimitErrors>({})

  function set<K extends keyof CountryLimitInput>(key: K, value: CountryLimitInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit() {
    const found = validateCountryLimit(form, defaults, takenCountries)
    setErrors(found)
    if (!hasErrors(found)) onSubmit(form)
  }

  return (
    <BaseModalOverlay
      width="max-w-lg"
      onClose={onCancel}
      title={
        <span className="flex flex-col gap-1">
          <span>{mode === 'add' ? 'Add country rule' : 'Edit country rule'}</span>
          <span className="text-sm font-normal text-primary-text/60">
            Country limits must be at least as strict as the default ({formatHours(defaults.minRestHours)} rest ·{' '}
            {formatHours(defaults.maxDutyHours)} duty).
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            {mode === 'add' ? 'Add rule' : 'Save rule'}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {mode === 'edit' ? (
          <InputField label="Country" value={limit?.country ?? ''} readOnly className="sm:col-span-2" />
        ) : (
          <SelectDropdown
            label="Country"
            value={form.country}
            error={errors.country}
            className="sm:col-span-2"
            options={[
              { value: '', label: 'Select country' },
              ...countries.map((country) => ({ value: country.name, label: country.name })),
            ]}
            onChange={(event) => set('country', event.target.value)}
          />
        )}

        <HoursField
          label="Minimum rest"
          value={form.minRestHours}
          error={errors.minRestHours}
          onChange={(value) => set('minRestHours', value)}
        />
        <HoursField
          label="Maximum duty"
          value={form.maxDutyHours}
          error={errors.maxDutyHours}
          onChange={(value) => set('maxDutyHours', value)}
        />
      </form>
    </BaseModalOverlay>
  )
}

/**
 * Number field carrying its unit inside the border, matching the `11 h` the
 * reference shows. The value stays a bare number so validation can read it.
 */
function HoursField({
  label,
  value,
  error,
  onChange,
}: {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  const fieldId = `${label.replace(/\s+/g, '-').toLowerCase()}-hours`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-xs font-medium text-border-desc">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`h-11 w-full rounded-lg border bg-white pr-9 pl-3 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary ${
            error ? 'border-invalid' : 'border-border-desc'
          }`}
        />
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-primary-text/50">
          h
        </span>
      </div>
      {error && <p className="text-xs font-medium text-invalid">{error}</p>}
    </div>
  )
}
