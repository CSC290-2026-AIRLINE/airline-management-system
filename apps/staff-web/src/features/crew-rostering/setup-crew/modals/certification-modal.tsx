import { useState } from 'react'
import { EMPTY_CERTIFICATION_FORM, hasErrors, validateCertification } from '../types/crew-form'
import type { Certification, CertificationErrors, CertificationInput } from '../types/types'
import { BaseModalOverlay, Button, DateField, InputField, SelectDropdown } from '../../shared/ui'

/**
 * Add and edit share this overlay too — same three fields, and the edit variant
 * adds the red `Remove` link the design asks for.
 *
 * The submit button is tied to the form by `id` and has no `onClick`: a submit
 * button fires both, which would add or save the certification twice.
 */
const FORM_ID = 'certification-form'

/** Small caps above each field, as the mockups draw the form. */
const LABEL = 'text-[11px] font-semibold tracking-wider text-label uppercase'
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
  onSubmit: (input: CertificationInput) => void | Promise<void>
  /** Only the edit variant renders `Remove`, so only it has to supply this. */
  onRemove?: () => void | Promise<void>
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
      variant="plain"
      width="max-w-lg"
      onClose={onCancel}
      title={mode === 'add' ? 'Add certification' : 'Edit certification'}
      footer={
        /* `Remove` sits on the far left, so the footer is one full-width row and the
           destructive action is pushed away from the save button by `mr-auto`. */
        <div className="flex w-full items-center gap-3 sm:justify-end">
          {mode === 'edit' && onRemove && (
            <button type="button" onClick={onRemove} className="mr-auto text-sm font-bold text-invalid underline-offset-4 hover:underline">
              Remove
            </button>
          )}
          <Button variant="outline" className="h-11 sm:px-6" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} className="h-11 sm:px-6">
            {mode === 'add' ? (
              <>
                <span className="sm:hidden">Add</span>
                <span className="max-sm:hidden">Add certification</span>
              </>
            ) : (
              <>
                <span className="sm:hidden">Save</span>
                <span className="max-sm:hidden">Save changes</span>
              </>
            )}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        <span className="sm:hidden">Checked before each assignment.</span>
        <span className="max-sm:hidden">Type ratings and mandatory certifications are checked before each assignment.</span>
      </p>

      <form
        id={FORM_ID}
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <InputField
          label="Certification name"
          labelClassName={LABEL}
          placeholder="e.g. A320 type rating"
          value={form.name}
          error={errors.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
        <div>
          <SelectDropdown
            label="Aircraft type"
            labelClassName={LABEL}
            value={form.aircraftType ?? ''}
            options={[{ value: '', label: 'Select aircraft type' }, ...fleets.map((fleet) => ({ value: fleet, label: fleet }))]}
            onChange={(event) => setForm((current) => ({ ...current, aircraftType: event.target.value || null }))}
          />
          <p className="mt-1.5 text-xs text-primary-text/55">Type ratings only · leave empty for other certifications</p>
        </div>
        <DateField
          label="Expiry date"
          labelClassName={LABEL}
          value={form.expiresOn}
          error={errors.expiresOn}
          onChange={(event) => setForm((current) => ({ ...current, expiresOn: event.target.value }))}
        />
      </form>
    </BaseModalOverlay>
  )
}
