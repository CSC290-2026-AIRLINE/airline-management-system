import { useState } from 'react'
import { hasErrors, toDefaultLimitsForm, validateDefaultLimits } from '../types/rule-form'
import type { CountryLimit, DefaultLimits, DefaultLimitsErrors, DefaultLimitsInput } from '../types/types'
import { BaseModalOverlay, Button, InputField } from '../../shared/ui'

/**
 * Edits the baseline every destination starts from.
 *
 * The submit button lives in the footer, outside the `<form>`, and is tied to it by `id`, like the
 * country rule overlay, so a click saves once. Submitting stages the change; the unsaved bar writes it.
 */
const FORM_ID = 'default-limits-form'

export function EditDefaultLimitsModal({
  defaults,
  countryLimits,
  onCancel,
  onSubmit,
}: {
  defaults: DefaultLimits
  countryLimits: readonly CountryLimit[]
  onCancel: () => void
  onSubmit: (input: DefaultLimitsInput) => void
}) {
  const [form, setForm] = useState<DefaultLimitsInput>(() => toDefaultLimitsForm(defaults))
  const [errors, setErrors] = useState<DefaultLimitsErrors>({})

  function set<K extends keyof DefaultLimitsInput>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit() {
    const found = validateDefaultLimits(form, countryLimits)
    setErrors(found)
    if (!hasErrors(found)) onSubmit(form)
  }

  return (
    <BaseModalOverlay
      width="max-w-lg"
      onClose={onCancel}
      title={
        <span className="flex flex-col gap-1">
          <span>Edit default limits</span>
          <span className="text-sm font-normal text-primary-text/60">
            These apply to every country. A country rule can only be stricter than them. Local cabin crew is the number of cabin crew on
            each leg who speak the destination&rsquo;s language.
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Save limits
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
        <InputField
          label="Minimum rest (h)"
          inputMode="numeric"
          value={form.minRestHours}
          error={errors.minRestHours}
          onChange={(event) => set('minRestHours', event.target.value)}
        />
        <InputField
          label="Maximum duty (h)"
          inputMode="numeric"
          value={form.maxDutyHours}
          error={errors.maxDutyHours}
          onChange={(event) => set('maxDutyHours', event.target.value)}
        />
        <InputField
          label="Maximum flights per duty"
          inputMode="numeric"
          value={form.maxFlightsPerDuty}
          error={errors.maxFlightsPerDuty}
          onChange={(event) => set('maxFlightsPerDuty', event.target.value)}
        />
        <InputField
          label="Pairing length (days)"
          inputMode="numeric"
          value={form.maxPairingDays}
          error={errors.maxPairingDays}
          onChange={(event) => set('maxPairingDays', event.target.value)}
        />
        <InputField
          label="28-day cap (h)"
          inputMode="numeric"
          value={form.hoursCap28d}
          error={errors.hoursCap28d}
          onChange={(event) => set('hoursCap28d', event.target.value)}
        />
        <InputField
          label="Local cabin crew per leg"
          inputMode="numeric"
          value={form.minLocalCrew}
          error={errors.minLocalCrew}
          onChange={(event) => set('minLocalCrew', event.target.value)}
        />
      </form>
    </BaseModalOverlay>
  )
}
