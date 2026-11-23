import { useState } from 'react'
import { EMPTY_CREW_FORM, hasErrors, toCrewForm, validateCrewForm } from '../types/crew-form'
import type { CrewFormErrors, CrewMember, CrewProfileInput } from '../types/types'
import { ALL_ROLES } from '../types/types'
import { BaseModalOverlay, Button, CloseIcon, DateField, InputField, MultiSelect, SelectDropdown } from '../../shared/ui'

/**
 * The submit button lives in the modal footer, outside the `<form>`, and is tied
 * to it by `id`. It carries no `onClick` of its own: a submit button fires both,
 * and the click would save the profile a second time.
 */
const FORM_ID = 'crew-profile-form'

/** Small caps above each field, as the mockups draw the form. */
const LABEL = 'text-[11px] font-semibold tracking-wider text-label uppercase'

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
  onSubmit: (input: CrewProfileInput) => void | Promise<void>
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
      variant="plain"
      width="max-w-3xl"
      onClose={onCancel}
      title={mode === 'create' ? 'Create crew profile' : 'Edit crew profile'}
      titleAside={
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-desc/60 text-primary-text transition-colors hover:bg-page-bg"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      }
      footer={
        <Button variant="primary" type="submit" form={FORM_ID} className="h-11 px-6">
          {mode === 'create' ? 'Create profile' : 'Save changes'}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        {mode === 'create'
          ? 'Create the roster-ready profile used by automatic assignment and legality checks.'
          : 'Update the fields used by automatic assignment and local-crew checks.'}
      </p>

      {/* DOM order is the wide layout's reading order. On a phone `max-sm:order-*` regroups it: names side by side, one field
          per row for the pickers, then the licence and the optional fields in pairs. */}
      <form
        id={FORM_ID}
        className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <InputField
          label="First name"
          labelClassName={LABEL}
          placeholder="e.g. Arisa"
          className="max-sm:order-1"
          value={form.firstName}
          error={errors.firstName}
          autoComplete="given-name"
          onChange={(event) => set('firstName', event.target.value)}
        />
        <InputField
          label="Last name"
          labelClassName={LABEL}
          placeholder="e.g. Wong"
          className="max-sm:order-2"
          value={form.lastName}
          error={errors.lastName}
          autoComplete="family-name"
          onChange={(event) => set('lastName', event.target.value)}
        />
        <InputField
          label="Employee number"
          labelClassName={LABEL}
          placeholder="e.g. EMP-0092"
          className="max-sm:order-3 max-sm:col-span-2"
          value={form.employeeNo}
          error={errors.employeeNo}
          onChange={(event) => set('employeeNo', event.target.value)}
        />
        <SelectDropdown
          label="Role"
          labelClassName={LABEL}
          className="max-sm:order-4 max-sm:col-span-2"
          value={form.role}
          options={ALL_ROLES.map((role) => ({ value: role, label: role }))}
          onChange={(event) => set('role', event.target.value as CrewProfileInput['role'])}
        />
        <SelectDropdown
          label="Base airport"
          labelClassName={LABEL}
          className="max-sm:order-5 max-sm:col-span-2"
          value={form.base}
          options={bases.map((base) => ({ value: base, label: base }))}
          onChange={(event) => set('base', event.target.value)}
        />
        <SelectDropdown
          label="Fleet (aircraft type)"
          labelClassName={LABEL}
          className="max-sm:order-7 max-sm:col-span-2"
          value={form.fleet}
          options={fleets.map((fleet) => ({ value: fleet, label: fleet }))}
          onChange={(event) => set('fleet', event.target.value)}
        />

        <MultiSelect
          label="Languages"
          labelClassName={LABEL}
          className="max-sm:order-6 max-sm:col-span-2"
          hint={mode === 'create' ? 'Used for local-crew eligibility' : 'Changes recheck local-crew eligibility'}
          placeholder="Select languages"
          options={languages.map((language) => ({ value: language.code, label: `${language.code} · ${language.label}` }))}
          selected={form.languages}
          onChange={(values) => set('languages', values)}
        />

        <InputField
          label="Licence number"
          labelClassName={LABEL}
          placeholder="e.g. TH-ATPL-0092"
          className="max-sm:order-8"
          value={form.licenceNumber}
          error={errors.licenceNumber}
          onChange={(event) => set('licenceNumber', event.target.value)}
        />
        <DateField
          label="Licence expiry"
          labelClassName={LABEL}
          className="max-sm:order-9"
          value={form.licenceExpiresOn}
          error={errors.licenceExpiresOn}
          onChange={(event) => set('licenceExpiresOn', event.target.value)}
        />
        <DateField
          label="Date of birth (optional)"
          labelClassName={LABEL}
          className="max-sm:order-10"
          value={form.dateOfBirth ?? ''}
          error={errors.dateOfBirth}
          onChange={(event) => set('dateOfBirth', event.target.value || null)}
        />
        <InputField
          label="Email (optional)"
          labelClassName={LABEL}
          placeholder="name@flython.example"
          type="email"
          className="max-sm:order-12 max-sm:col-span-2"
          value={form.email ?? ''}
          error={errors.email}
          autoComplete="email"
          onChange={(event) => set('email', event.target.value || null)}
        />
        <InputField
          label="Phone (optional)"
          labelClassName={LABEL}
          placeholder="+66 …"
          type="tel"
          className="max-sm:order-11"
          value={form.phone ?? ''}
          autoComplete="tel"
          onChange={(event) => set('phone', event.target.value || null)}
        />
      </form>
    </BaseModalOverlay>
  )
}
