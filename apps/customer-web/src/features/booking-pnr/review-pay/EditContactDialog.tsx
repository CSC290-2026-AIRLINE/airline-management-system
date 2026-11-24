import { useState, type FormEvent } from 'react'
import { Input } from '@customer-web/components/ui/input'
import { Field } from '@customer-web/components/ui/field'
import { ApiError } from '../api/client'
import { Dialog } from '../components/Dialog'
import controls from '../styles/controls'

interface EditContactDialogProps {
  open: boolean
  contactEmail: string
  contactPhone: string | null
  onClose: () => void
  /** Saves the contact details of the booking that is still on hold. */
  onSave: (contact: { contactEmail: string; contactPhone?: string }) => Promise<void>
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The contact details of a held booking, so a customer who typed the wrong email or phone can correct it before paying.
 * The details are not part of the fare, so saving them never moves the price and the hold keeps the time it had.
 *
 * The dialog is mounted while it is open, so it always starts with the details the booking holds now.
 */
export function EditContactDialog({ open, contactEmail, contactPhone, onClose, onSave }: EditContactDialogProps) {
  const [email, setEmail] = useState(contactEmail)
  const [phone, setPhone] = useState(contactPhone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Whether the customer has tried to save. The messages under the fields wait for that, so the form is not red while it
     is still empty. */
  const [attempted, setAttempted] = useState(false)

  function problems() {
    const found: { email?: string; phone?: string } = {}
    if (!EMAIL.test(email.trim())) found.email = 'Enter a valid email address.'
    return found
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    const found = problems()
    if (found.email || found.phone) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ contactEmail: email.trim(), contactPhone: phone.trim() || undefined })
      onClose()
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'BOOKING_CLOSED') {
        setError('This hold is over, so the contact details can no longer be changed.')
      } else {
        setError('We could not save your contact details. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  const found = attempted ? problems() : {}

  return (
    <Dialog
      open={open}
      title="Contact details"
      description="We send the booking confirmation and any flight news to these details."
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <Field id="rp-contact-email" label="Email" error={found.email}>
          <Input
            id="rp-contact-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            aria-invalid={found.email ? true : undefined}
            aria-describedby={found.email ? 'rp-contact-email-error' : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field id="rp-contact-phone" label="Phone (optional)" error={found.phone}>
          <Input
            id="rp-contact-phone"
            type="tel"
            autoComplete="tel"
            maxLength={50}
            aria-invalid={found.phone ? true : undefined}
            aria-describedby={found.phone ? 'rp-contact-phone-error' : undefined}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className={controls.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={controls.primary} disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
