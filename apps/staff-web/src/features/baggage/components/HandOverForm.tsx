import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Input } from '@staff-web/components/ui/input'
import type { HandOverBody } from '../api/bag-deliveries'
import { COLLECTOR_LABELS, ID_DOCUMENT_LABELS, ID_DOCUMENT_TYPES, type IdDocumentType } from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { FIELD_BOX, Field, FormError, SelectBox } from './primitives'

const DOCUMENT_OPTIONS = ID_DOCUMENT_TYPES.map((d) => ({ value: d, label: ID_DOCUMENT_LABELS[d] }))
/** Handover to someone sent by the passenger is listed but can't be picked yet; picking it shows why for a few seconds. */
const REPRESENTATIVE = 'representative'
const COLLECTOR_OPTIONS = [
  { value: 'passenger', label: COLLECTOR_LABELS.passenger },
  { value: REPRESENTATIVE, label: 'Someone sent by the passenger' },
]
const REPRESENTATIVE_UNAVAILABLE_NOTE =
  'Handover to someone sent by the passenger is temporarily unavailable. The passenger must collect the bag in person.'

/**
 * Ownership check at handover: what the passenger shows is checked against the case on the server, and the bag is only
 * released when it agrees. Each attempt is kept, so a failed one shows in the checks list. Only the passenger can
 * collect the bag for now.
 */
export function HandOverForm({ deliveryId, onHandOver }: { deliveryId: string; onHandOver: (body: HandOverBody) => Promise<void> }) {
  const [representativeTried, setRepresentativeTried] = useState(false)
  useEffect(() => {
    if (!representativeTried) return
    const timer = setTimeout(() => setRepresentativeTried(false), 4000)
    return () => clearTimeout(timer)
  }, [representativeTried])
  const [bookingReference, setBookingReference] = useState('')
  const [lastName, setLastName] = useState('')
  const [documentType, setDocumentType] = useState<IdDocumentType>('passport')
  const [documentNumber, setDocumentNumber] = useState('')
  const [documentChecked, setDocumentChecked] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = (field: string) => `handover-${field}-${deliveryId}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!bookingReference.trim() || !lastName.trim() || !documentNumber.trim()) {
      setError('Enter the booking reference, surname and document number.')
      return
    }
    if (documentNumber.replace(/[^A-Za-z0-9]/g, '').length < 4) {
      setError('Enter the full document number.')
      return
    }
    if (!documentChecked) {
      setError('Check the photo and name on the document first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onHandOver({
        collector: 'passenger',
        bookingReference: bookingReference.trim().toUpperCase(),
        lastName: lastName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        documentChecked,
        note: note.trim() || undefined,
      })
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate aria-labelledby={id('title')}>
      <h4 id={id('title')} className="m-0 text-base font-semibold text-[#14213d]">
        Check the owner
      </h4>
      <Field label="Collected by" htmlFor={id('collector')}>
        <SelectBox
          id={id('collector')}
          value="passenger"
          onValueChange={(v) => setRepresentativeTried(v === REPRESENTATIVE)}
          options={COLLECTOR_OPTIONS}
        />
      </Field>
      {representativeTried && (
        <p role="status" className="m-0 rounded-lg bg-[#fff4dd] px-3 py-2 text-sm leading-normal text-[#76551d]">
          {REPRESENTATIVE_UNAVAILABLE_NOTE}
        </p>
      )}
      <div className="flex gap-3 max-sm:flex-col">
        <Field label="Booking reference" htmlFor={id('booking')}>
          <Input
            id={id('booking')}
            maxLength={6}
            autoComplete="off"
            value={bookingReference}
            onChange={(e) => setBookingReference(e.target.value)}
            className={`${FIELD_BOX} uppercase`}
          />
        </Field>
        <Field label="Passenger surname" htmlFor={id('surname')}>
          <Input
            id={id('surname')}
            maxLength={100}
            autoComplete="off"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={FIELD_BOX}
          />
        </Field>
      </div>
      <div className="flex gap-3 max-sm:flex-col">
        <Field label="Document" htmlFor={id('doc-type')}>
          <SelectBox
            id={id('doc-type')}
            value={documentType}
            onValueChange={(v) => setDocumentType(v as IdDocumentType)}
            options={DOCUMENT_OPTIONS}
          />
        </Field>
        <Field label="Document number" htmlFor={id('doc-number')}>
          <Input
            id={id('doc-number')}
            maxLength={30}
            autoComplete="off"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            className={FIELD_BOX}
          />
        </Field>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id={id('doc-checked')}
          checked={documentChecked}
          onCheckedChange={(v) => setDocumentChecked(v === true)}
          className="mt-0.5"
        />
        <label htmlFor={id('doc-checked')} className="text-sm leading-normal text-[#14213d]">
          The photo and name on the document match the passenger.
        </label>
      </div>
      <Field label="Note (optional)" htmlFor={id('note')}>
        <Input id={id('note')} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={FIELD_BOX} />
      </Field>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={busy}
          className="h-auto rounded-lg bg-[#fca311] px-3.5 py-2 text-sm leading-normal font-semibold text-[#14213d] hover:bg-[#fca311]/90"
        >
          {busy ? 'Checking…' : 'Check and hand over'}
        </Button>
      </div>
    </form>
  )
}
