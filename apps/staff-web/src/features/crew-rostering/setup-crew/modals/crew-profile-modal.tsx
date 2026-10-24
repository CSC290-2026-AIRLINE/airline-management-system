import { useState } from 'react'
import { EMPTY_CREW_FORM, hasErrors, toCrewForm, validateCrewForm } from '../types/crew-form'
import type { CrewFormErrors, CrewMember, CrewProfileInput } from '../types/types'
import { ALL_ROLES } from '../types/types'
import { BaseModalOverlay, Button, DateField, InputField, MultiSelect, SelectDropdown } from '../../shared/ui'

/**
 * The submit button lives in the modal footer, outside the `<form>`, and is tied
 * to it by `id`. It carries no `onClick` of its own: a submit button fires both,
 * and the click would save the profile a second time.
 */
const FORM_ID = 'crew-profile-form'

/**
 * Create and edit share one component because they share every field; `mode`
 * only changes the title, the submit label and the copy above the form.
 *
 * The employee number is offered but editable: a real roster may already hold
 * numbers this mock has never seen, and blocking the field would make that
 * unfixable. `takenNumbers` still rejects a number already in use.
 */
export function CrewProfileModal({
  mode,
  crew,
  bases,
  fleets,
  languages,
  suggestedEmployeeNo,
  takenNumbers,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  crew: CrewMember | null
  bases: readonly string[]
  fleets: readonly string[]
  languages: readonly { code: string; label: string }[]
  suggestedEmployeeNo: string
  takenNumbers: readonly string[]
  onCancel: () => void
  onSubmit: (input: CrewProfileInput) => void
}) {
  const [form, setForm] = useState<CrewProfileInput>(() =>
    crew ? toCrewForm(crew) : { ...EMPTY_CREW_FORM, employeeNo: suggestedEmployeeNo },
  )
  const [errors, setErrors] = useState<CrewFormErrors>({})

  function set<K extends keyof CrewProfileInput>(key: K, value: CrewProfileInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit() {
    const found = validateCrewForm(form, takenNumbers)
    setErrors(found)
    if (!hasErrors(found)) onSubmit(form)
  }

  return (
    <BaseModalOverlay
      width="max-w-3xl"
      onClose={onCancel}
      title={
        <span className="flex flex-col gap-1">
          <span>{mode === 'create' ? 'Create crew profile' : 'Edit crew profile'}</span>
          <span className="text-sm font-normal text-primary-text/60">
            {mode === 'create'
              ? 'Create the roster-ready profile used by automatic assignment and legality checks.'
              : 'Update the fields used by automatic assignment and local-crew checks.'}
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            {mode === 'create' ? 'Create profile' : 'Save changes'}
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
          label="First name"
          value={form.firstName}
          error={errors.firstName}
          autoComplete="given-name"
          onChange={(event) => set('firstName', event.target.value)}
        />
        <InputField
          label="Last name"
          value={form.lastName}
          error={errors.lastName}
          autoComplete="family-name"
          onChange={(event) => set('lastName', event.target.value)}
        />
        <InputField
          label="Employee number"
          value={form.employeeNo}
          error={errors.employeeNo}
          onChange={(event) => set('employeeNo', event.target.value)}
        />
        <SelectDropdown
          label="Role"
          value={form.role}
          options={ALL_ROLES.map((role) => ({ value: role, label: role }))}
          onChange={(event) => set('role', event.target.value as CrewProfileInput['role'])}
        />
        <SelectDropdown
          label="Base airport"
          value={form.base}
          options={bases.map((base) => ({ value: base, label: base }))}
          onChange={(event) => set('base', event.target.value)}
        />
        <SelectDropdown
          label="Fleet (aircraft type)"
          value={form.fleet}
          options={fleets.map((fleet) => ({ value: fleet, label: fleet }))}
          onChange={(event) => set('fleet', event.target.value)}
        />

        {/* Full width: the dropdown panel is absolutely positioned and would be
            clipped by a one-column grid track. */}
        <MultiSelect
          label="Languages"
          className="sm:col-span-2"
          hint="Checked by local-crew eligibility before assignment."
          placeholder="Select languages"
          options={languages.map((language) => ({ value: language.code, label: `${language.code} · ${language.label}` }))}
          selected={form.languages}
          onChange={(values) => set('languages', values)}
        />

        <InputField
          label="Licence number"
          value={form.licenceNumber}
          error={errors.licenceNumber}
          onChange={(event) => set('licenceNumber', event.target.value)}
        />
        <DateField
          label="Licence expiry"
          value={form.licenceExpiresOn}
          error={errors.licenceExpiresOn}
          onChange={(event) => set('licenceExpiresOn', event.target.value)}
        />
        <DateField
          label="Date of birth (optional)"
          value={form.dateOfBirth ?? ''}
          error={errors.dateOfBirth}
          onChange={(event) => set('dateOfBirth', event.target.value || null)}
        />
        <InputField
          label="Email (optional)"
          type="email"
          value={form.email ?? ''}
          error={errors.email}
          autoComplete="email"
          onChange={(event) => set('email', event.target.value || null)}
        />
        <InputField
          label="Phone (optional)"
          type="tel"
          value={form.phone ?? ''}
          autoComplete="tel"
          onChange={(event) => set('phone', event.target.value || null)}
          className="sm:col-span-2"
        />
      </form>
    </BaseModalOverlay>
  )
}
