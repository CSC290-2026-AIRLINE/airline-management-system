import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Separator } from '@staff-web/components/ui/separator'
import { useLostReportApi, type BookingCoupon, type BookingLookup, type LostReportCase } from '../api/lost-reports'
import {
  BAG_COLOURS,
  BAG_TYPES,
  BAG_TYPE_LABELS,
  BAGGAGE_TAG_PATTERN,
  colourLabel,
  formatFlightDate,
  type BagColour,
  type BagType,
} from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { F10Card, FIELD_BOX, Field, FormError, SelectBox } from './primitives'

const TYPE_OPTIONS = BAG_TYPES.map((t) => ({ value: t, label: BAG_TYPE_LABELS[t] }))
const COLOUR_OPTIONS = BAG_COLOURS.map((c) => ({ value: c, label: colourLabel(c) }))
const BOOKING_REFERENCE = /^[A-Za-z0-9]{6}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[0-9 ()-]{6,30}$/

function couponKey(c: BookingCoupon): string {
  return `${c.passengerId}:${c.flightId}`
}

function couponLabel(c: BookingCoupon): string {
  return `${c.firstName} ${c.lastName} · ${c.flightNumber} · ${formatFlightDate(c.flightDate)}`
}

/** Step 1: find the booking the passenger at the desk is on. */
function FindBooking({ onFound }: { onFound: (booking: BookingLookup) => void }) {
  const api = useLostReportApi()
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = reference.trim().toUpperCase()
    if (!BOOKING_REFERENCE.test(value)) {
      setError('A booking reference is 6 letters or digits.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onFound(await api.lookupBooking(value))
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      <div className="flex items-end gap-3 max-md:flex-col max-md:items-stretch">
        <Field label="Booking reference" htmlFor="nc-reference">
          <Input
            id="nc-reference"
            maxLength={6}
            autoComplete="off"
            placeholder="e.g. K7Q2MZ"
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            className={FIELD_BOX}
          />
        </Field>
        <Button
          type="submit"
          disabled={busy}
          className="h-auto min-h-[46px] rounded-lg bg-[#14213d] px-5 py-3 text-sm leading-normal font-semibold text-white hover:bg-[#14213d]/90"
        >
          {busy ? 'Finding…' : 'Find booking'}
        </Button>
      </div>
      <FormError message={error} />
    </form>
  )
}

/** Step 2: who lost the bag, on which flight, and what it looks like. */
function CaseDetails({
  booking,
  onCreated,
  onBack,
}: {
  booking: BookingLookup
  onCreated: (report: LostReportCase) => void
  onBack: () => void
}) {
  const api = useLostReportApi()
  // A held, expired or cancelled coupon never flew, so it cannot have a lost bag.
  const coupons = booking.coupons.filter((c) => c.status === 'confirmed')
  const [picked, setPicked] = useState(coupons[0] ? couponKey(coupons[0]) : '')
  const [bagType, setBagType] = useState<BagType>('suitcase')
  const [colour, setColour] = useState<BagColour>('black')
  const [tagNumber, setTagNumber] = useState('')
  const [brand, setBrand] = useState('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState(booking.contactEmail)
  const [contactPhone, setContactPhone] = useState(booking.contactPhone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const coupon = coupons.find((c) => couponKey(c) === picked)

  function check(): string | null {
    if (!coupon) return 'Choose the passenger and flight.'
    if (tagNumber.trim() && !BAGGAGE_TAG_PATTERN.test(tagNumber.trim())) return 'Use 10 digits for the tag: 0, then 789, then 6 digits.'
    if (contactEmail.trim() && !EMAIL.test(contactEmail.trim())) return 'Check the email address.'
    if (contactPhone.trim() && !PHONE.test(contactPhone.trim())) return 'Use digits, spaces, +, - or brackets for the phone number.'
    return null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = check()
    if (problem || !coupon) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const report = await api.create({
        bookingReference: booking.bookingReference,
        passengerId: coupon.passengerId,
        flightId: coupon.flightId,
        bagType,
        colour,
        tagNumber: tagNumber.trim() || undefined,
        brand: brand.trim() || undefined,
        description: description.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      })
      onCreated(report)
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base text-[#14213d]">
          Booking <span className="font-semibold">{booking.bookingReference}</span>
        </p>
        <Button type="button" variant="link" onClick={onBack} className="h-auto p-0 text-sm font-semibold text-[#14213d]">
          Use another booking
        </Button>
      </div>

      {coupons.length === 0 ? (
        <p className="rounded-lg bg-[#fff4de] px-3.5 py-3 text-base text-[#94651c]">
          This booking has no ticketed flight, so no lost bag case can be opened for it.
        </p>
      ) : (
        <>
          <Field label="Passenger and flight" htmlFor="nc-coupon">
            <SelectBox
              id="nc-coupon"
              value={picked}
              onValueChange={setPicked}
              options={coupons.map((c) => ({ value: couponKey(c), label: couponLabel(c) }))}
            />
          </Field>
          <div className="flex gap-3 max-md:flex-col">
            <Field label="Bag type" htmlFor="nc-type">
              <SelectBox id="nc-type" value={bagType} onValueChange={(v) => setBagType(v as BagType)} options={TYPE_OPTIONS} />
            </Field>
            <Field label="Colour" htmlFor="nc-colour">
              <SelectBox id="nc-colour" value={colour} onValueChange={(v) => setColour(v as BagColour)} options={COLOUR_OPTIONS} />
            </Field>
          </div>
          <div className="flex gap-3 max-md:flex-col">
            <Field label="Tag number" htmlFor="nc-tag">
              <Input
                id="nc-tag"
                inputMode="numeric"
                maxLength={10}
                placeholder="From the passenger's receipt"
                value={tagNumber}
                onChange={(e) => setTagNumber(e.target.value)}
                className={FIELD_BOX}
              />
            </Field>
            <Field label="Brand" htmlFor="nc-brand">
              <Input
                id="nc-brand"
                maxLength={100}
                placeholder="e.g. Samsonite"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={FIELD_BOX}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="nc-description">
            <Input
              id="nc-description"
              maxLength={1000}
              placeholder="Marks, stickers, what is inside"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={FIELD_BOX}
            />
          </Field>
          <Separator className="bg-[#d8dce6]" />
          <div className="flex gap-3 max-md:flex-col">
            <Field label="Contact email" htmlFor="nc-email">
              <Input
                id="nc-email"
                type="email"
                maxLength={254}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={FIELD_BOX}
              />
            </Field>
            <Field label="Contact phone" htmlFor="nc-phone">
              <Input
                id="nc-phone"
                type="tel"
                maxLength={30}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={FIELD_BOX}
              />
            </Field>
          </div>
        </>
      )}

      <FormError message={error} />
      {coupons.length > 0 && (
        <div className="flex justify-end max-md:flex-col max-md:items-stretch">
          <Button
            type="submit"
            disabled={saving}
            className="h-auto rounded-lg bg-[#fca311] px-5 py-3 text-sm leading-normal font-semibold text-[#14213d] hover:bg-[#fca311]/90"
          >
            {saving ? 'Saving…' : 'Open case and run matching'}
          </Button>
        </div>
      )}
    </form>
  )
}

/** "Card / New case": a passenger at the desk reports a missing bag. */
export function NewCaseCard({ onCreated, onClose }: { onCreated: (report: LostReportCase) => void; onClose: () => void }) {
  const [booking, setBooking] = useState<BookingLookup | null>(null)

  return (
    <F10Card aria-labelledby="new-case-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="new-case-title"
          className="m-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-[#14213d] max-md:text-[22px] max-md:tracking-normal"
        >
          New lost bag case
        </h2>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="h-auto rounded-lg border-[#d8dce6] px-3.5 py-2 text-sm leading-normal font-semibold text-[#14213d]"
        >
          Cancel
        </Button>
      </div>
      {booking ? (
        <CaseDetails key={booking.bookingReference} booking={booking} onCreated={onCreated} onBack={() => setBooking(null)} />
      ) : (
        <FindBooking onFound={setBooking} />
      )}
    </F10Card>
  )
}
