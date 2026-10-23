import { useState } from 'react'
import { EMPTY_CERTIFICATION_FORM, hasErrors, validateCertification } from '../types/crew-form'
import type { Certification, CertificationErrors, CertificationInput } from '../types/types'
import { BaseModalOverlay, Button, DateField, InputField, InfoBox, SelectDropdown } from '../../shared/ui'

/**
 * Add and edit share this overlay too — same three fields, and the edit variant
 * adds the red `Remove` link the design asks for.
 *
 * The submit button is tied to the form by `id` and has no `onClick`: a submit
 * button fires both, which would add or save the certification twice.
 */
const FORM_ID = 'certification-form'
export function CertificationModal({
  mode,
  certification,
  fleets,
  onCancel,
  onSubmit,
  onRemove,
}: {
  mode: 'add' | 'edit'
  /** The certification being edited, or null when adding. */
  certification: Certification | null
  fleets: readonly string[]
  onCancel: () => void
  onSubmit: (input: CertificationInput) => void
  /** Only the edit variant renders `Remove`, so only it has to supply this. */
  onRemove?: () => void
}) {
  const [form, setForm] = useState<CertificationInput>(
    certification
      ? { name: certification.name, aircraftType: certification.aircraftType, expiresOn: certification.expiresOn }
      : EMPTY_CERTIFICATION_FORM,
  )
  const [errors, setErrors] = useState<CertificationErrors>({})

  function handleSubmit() {
    const found = validateCertification(form)
    setErrors(found)
    if (!hasErrors(found)) onSubmit(form)
  }

  return (
    <BaseModalOverlay
      width="max-w-lg"
      onClose={onCancel}
      title={
        <span className="flex flex-col gap-1">
          <span>{mode === 'add' ? 'Add certification' : 'Edit certification'}</span>
          <span className="text-sm font-normal text-primary-text/60">
            Type ratings and mandatory certifications are checked before each assignment.
          </span>
        </span>
      }
      footer={
        /* `Remove` sits on the far left, so the footer goes full width and the
           destructive action is pushed away from the save button by `ml-auto`. */
        <div className="flex w-full flex-wrap items-center gap-3">
          {mode === 'edit' && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="mr-auto text-sm font-semibold text-invalid underline-offset-4 hover:underline"
            >
              Remove
            </button>
          )}
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            {mode === 'add' ? 'Add certification' : 'Save changes'}
          </Button>
        </div>
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
        <InputField
          label="Certification name"
          placeholder="A320 type rating"
          value={form.name}
          error={errors.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
        <SelectDropdown
          label="Aircraft type"
          value={form.aircraftType ?? ''}
          options={[{ value: '', label: 'Not aircraft specific' }, ...fleets.map((fleet) => ({ value: fleet, label: fleet }))]}
          onChange={(event) => setForm((current) => ({ ...current, aircraftType: event.target.value || null }))}
        />
        <DateField
          label="Expiry date"
          value={form.expiresOn}
          error={errors.expiresOn}
          onChange={(event) => setForm((current) => ({ ...current, expiresOn: event.target.value }))}
        />
        <InfoBox>Leave the aircraft type empty for certifications that are not tied to one airframe, such as CRM.</InfoBox>
      </form>
    </BaseModalOverlay>
  )
}
