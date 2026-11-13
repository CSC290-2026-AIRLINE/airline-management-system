import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Input } from '@staff-web/components/ui/input'
import type { HandOverBody } from '../api/bag-deliveries'
import { COLLECTORS, COLLECTOR_LABELS, ID_DOCUMENT_LABELS, ID_DOCUMENT_TYPES, type Collector, type IdDocumentType } from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { FIELD_BOX, Field, FormError, SelectBox } from './primitives'

/**
 * TEMPORARY RESTRICTION: only the passenger can collect the bag. Handover to someone sent by the passenger is refused by
 * the server until an approved owner-authorisation procedure exists, so it is not offered here either.
 */
const AVAILABLE_COLLECTORS: readonly Collector[] = COLLECTORS.filter((c) => c === 'passenger')
const COLLECTOR_OPTIONS = AVAILABLE_COLLECTORS.map((c) => ({ value: c, label: COLLECTOR_LABELS[c] }))
const REPRESENTATIVE_UNAVAILABLE_NOTE =
  'Handover to someone sent by the passenger is temporarily unavailable. The passenger must collect the bag in person.'
const DOCUMENT_OPTIONS = ID_DOCUMENT_TYPES.map((d) => ({ value: d, label: ID_DOCUMENT_LABELS[d] }))

/**
 * Ownership check at handover: what the person collecting the bag shows is checked against the case on the server, and
 * the bag is only released when it agrees. Each attempt is kept, so a failed one shows in the checks list.
 */
export function HandOverForm({ deliveryId, onHandOver }: { deliveryId: string; onHandOver: (body: HandOverBody) => Promise<void> }) {
  const [collector, setCollector] = useState<Collector>('passenger')
  const [representativeName, setRepresentativeName] = useState('')
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
    if (!AVAILABLE_COLLECTORS.includes(collector)) {
      setError(REPRESENTATIVE_UNAVAILABLE_NOTE)
      return
    }
    if (collector === 'representative' && !representativeName.trim()) {
      setError('Enter the name of the person collecting the bag.')
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
        collector,
        representativeName: collector === 'representative' ? representativeName.trim() : undefined,
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
        <SelectBox id={id('collector')} value={collector} onValueChange={(v) => setCollector(v as Collector)} options={COLLECTOR_OPTIONS} />
      </Field>
      <p role="note" className="m-0 rounded-lg bg-[#fff4dd] px-3 py-2 text-sm leading-normal text-[#76551d]">
        {REPRESENTATIVE_UNAVAILABLE_NOTE}
      </p>
      {collector === 'representative' && (
        <Field label="Name of the person collecting" htmlFor={id('rep')}>
          <Input
            id={id('rep')}
            maxLength={100}
            autoComplete="off"
            value={representativeName}
            onChange={(e) => setRepresentativeName(e.target.value)}
            className={FIELD_BOX}
          />
        </Field>
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
          {collector === 'representative'
            ? 'The photo and name on the document match the person collecting the bag.'
            : 'The photo and name on the document match the passenger.'}
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
