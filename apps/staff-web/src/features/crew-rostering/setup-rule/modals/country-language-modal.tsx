import { useState } from 'react'
import { EMPTY_COUNTRY_LANGUAGE_FORM, hasErrors, toCountryLanguageForm, validateCountryLanguage } from '../types/rule-form'
import type { CountryLanguage, CountryLanguageErrors, CountryLanguageInput, LanguageOption } from '../types/types'
import { BaseModalOverlay, Button, InputField, MultiSelect, SelectDropdown } from '../../shared/ui'

/**
 * Add and edit share one form: same two fields, and the destination is the only
 * thing the edit variant locks.
 *
 * The submit button is tied to the form by `id` and carries no `onClick`, so a
 * click cannot save the mapping twice.
 */
const FORM_ID = 'country-language-form'

export function AddCountryLanguageModal({
  countries,
  languages,
  takenCountries,
  onCancel,
  onSubmit,
}: {
  countries: readonly { name: string }[]
  languages: readonly LanguageOption[]
  takenCountries: readonly string[]
  onCancel: () => void
  onSubmit: (input: CountryLanguageInput) => void
}) {
  return (
    <CountryLanguageForm
      countries={countries}
      languages={languages}
      takenCountries={takenCountries}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  )
}

export function EditCountryLanguageModal({
  mapping,
  countries,
  languages,
  takenCountries,
  onCancel,
  onSubmit,
}: {
  mapping: CountryLanguage
  countries: readonly { name: string }[]
  languages: readonly LanguageOption[]
  takenCountries: readonly string[]
  onCancel: () => void
  onSubmit: (input: CountryLanguageInput) => void
}) {
  return (
    <CountryLanguageForm
      mode="edit"
      mapping={mapping}
      countries={countries}
      languages={languages}
      takenCountries={takenCountries}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  )
}

function CountryLanguageForm({
  mode = 'add',
  countries,
  languages,
  takenCountries,
  mapping = null,
  onCancel,
  onSubmit,
}: {
  mode?: 'add' | 'edit'
  mapping?: CountryLanguage | null
  countries: readonly { name: string }[]
  languages: readonly LanguageOption[]
  takenCountries: readonly string[]
  onCancel: () => void
  onSubmit: (input: CountryLanguageInput) => void
}) {
  const [form, setForm] = useState<CountryLanguageInput>(() =>
    mapping ? toCountryLanguageForm(mapping) : { ...EMPTY_COUNTRY_LANGUAGE_FORM },
  )
  const [errors, setErrors] = useState<CountryLanguageErrors>({})

  function handleSubmit() {
    const found = validateCountryLanguage(form, takenCountries)
    setErrors(found)
    if (!hasErrors(found)) onSubmit(form)
  }

  return (
    <BaseModalOverlay
      width="max-w-lg"
      onClose={onCancel}
      title={
        <span className="flex flex-col gap-1">
          <span>{mode === 'add' ? 'Add country' : 'Edit country languages'}</span>
          <span className="text-sm font-normal text-primary-text/60">Choose the languages that count as local at this destination.</span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            {mode === 'add' ? 'Add country' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {mode === 'edit' ? (
          <InputField label="Country" value={mapping?.country ?? ''} readOnly />
        ) : (
          <SelectDropdown
            label="Country"
            value={form.country}
            error={errors.country}
            options={[
              { value: '', label: 'Select country' },
              ...countries.map((country) => ({ value: country.name, label: country.name })),
            ]}
            onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
          />
        )}

        {errors.languages && <p className="-mt-1 text-xs font-medium text-invalid">{errors.languages}</p>}

        <MultiSelect
          label="Accepted languages"
          hint="Used for local-crew eligibility"
          placeholder="Select languages"
          options={languages.map((language) => ({ value: language.code, label: language.name }))}
          selected={form.languages}
          onChange={(languages) => setForm((current) => ({ ...current, languages }))}
        />
      </form>
    </BaseModalOverlay>
  )
}
