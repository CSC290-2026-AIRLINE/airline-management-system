import { useEffect, useReducer, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import {
  buildCreateLostReportPayload,
  buildCreateLostReportFormData,
  buildBookingFlightSummary,
  bookingPassengerIdForSubmit,
  createLostReportPageState,
  createPhotoPreview,
  flightsForSelection,
  lostReportPageReducer,
  PASSENGER_BAG_COLOURS,
  PASSENGER_BAG_TYPES,
  isCurrentFlightLookup,
  LOST_REPORT_PHOTO_ACCEPT,
  selectedTravellerName,
  showTravellerSelector,
  usableTravellers,
  validateLostReportForm,
  validateLostReportPhoto,
  type EligibleFlight,
  type EligibleTraveller,
  type LostBagFormValues,
  type PhotoPreview,
} from './lost-report-form'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card } from '@customer-web/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@customer-web/components/ui/dialog'
import { Field } from '@customer-web/components/ui/cw-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/cw-select'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@customer-web/components/ui/radio-group'
import { Textarea } from '@customer-web/components/ui/textarea'
import { readBaggageApiError } from '../api-error'
import { caseRecoveryErrorMessage } from './case-page-recovery'
import './PassengerLostBagReportPage.css'

interface CreatedReport {
  caseNumber: string
}

const EMPTY_VALUES: LostBagFormValues = {
  bookingReference: '',
  surname: '',
  flightId: '',
  bagType: '',
  colour: '',
  tagNumber: '',
  brand: '',
  description: '',
  contactEmail: '',
  contactPhone: '',
}

const BAG_COLOUR_SWATCH: Record<(typeof PASSENGER_BAG_COLOURS)[number][0], string> = {
  black: '#202124',
  white: '#fff',
  grey: '#87909d',
  blue: '#3478c8',
  red: '#d94c4c',
  green: '#398c5a',
  yellow: '#e1b92e',
  orange: '#ed8a2f',
  pink: '#e887a5',
  purple: '#9068b4',
  brown: '#805738',
  beige: '#d8c69a',
  multi: 'linear-gradient(135deg, #e74c3c 0 25%, #f1c40f 25% 50%, #2ecc71 50% 75%, #3498db 75%)',
}

async function getResponseMessage(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (response.status === 401) return 'Your sign-in has expired. Sign in again and retry.'
  if (response.status === 403) return 'This customer account is not authorized to use those booking details.'
  return readBaggageApiError(body).message ?? fallback
}

function formatFlightDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

/** Signed-in reporting (inside AppAuthProvider): the authenticated customer requests. */
export function PassengerLostBagReportPage() {
  const { fetchWithAuth } = useAppAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<LostBagFormValues>(EMPTY_VALUES)
  const [pageState, dispatch] = useReducer(lostReportPageReducer, undefined, createLostReportPageState)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState('')
  const photoInput = useRef<HTMLInputElement>(null)
  // The selected photo's temporary preview URL: created in event handlers only, released when replaced or cleared.
  const photoPreview = useRef<PhotoPreview | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  // The larger preview is a shadcn Dialog, which traps focus, closes on Escape and returns focus to the thumbnail.
  const [isPhotoEnlarged, setIsPhotoEnlarged] = useState(false)

  function showPhotoPreview(file: File | null) {
    // Close the larger preview first, so it never shows a URL that is about to be revoked.
    setIsPhotoEnlarged(false)
    photoPreview.current?.release()
    photoPreview.current = file ? createPhotoPreview(file) : null
    setPhotoPreviewUrl(photoPreview.current?.url ?? null)
  }

  useEffect(
    () => () => {
      photoPreview.current?.release()
      photoPreview.current = null
    },
    [],
  )
  const submissionPending = useRef(false)
  const flightLookupRequest = useRef(0)
  const flightLookupAccess = useRef({ bookingReference: '', surname: '' })
  // Own bag (or no traveller list) uses the original flights and request; another traveller, their flights +
  // bookingPassengerId.
  function flightsFor(travellerId: string): EligibleFlight[] {
    return flightsForSelection(pageState.flights, pageState.travellers, travellerId)
  }
  const availableFlights = flightsFor(pageState.selectedTravellerId)
  const coTravellerId = bookingPassengerIdForSubmit(pageState.travellers, pageState.selectedTravellerId)
  const bagOwnerName = coTravellerId ? selectedTravellerName(pageState.travellers, pageState.selectedTravellerId) : null
  const showWhoseBag = showTravellerSelector(pageState.travellers)

  function selectTraveller(bookingPassengerId: string) {
    dispatch({ type: 'traveller-selected', bookingPassengerId })
    const nextFlights = flightsFor(bookingPassengerId)
    // A flight the newly chosen traveller does not hold is cleared, so another traveller's flight is never submitted.
    setValues((current) => (nextFlights.some((flight) => flight.flightId === current.flightId) ? current : { ...current, flightId: '' }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.flightId
      delete next.traveller
      return next
    })
  }

  function updateValue<K extends keyof LostBagFormValues>(key: K, value: LostBagFormValues[K]) {
    if (key === 'bookingReference' || key === 'surname') {
      flightLookupRequest.current += 1
      flightLookupAccess.current = { ...flightLookupAccess.current, [key]: value }
    }

    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === 'bookingReference' || key === 'surname' ? { flightId: '' } : {}),
    }))
    if (key === 'bookingReference' || key === 'surname') dispatch({ type: 'flights-reset' })
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      if (key === 'contactEmail' || key === 'contactPhone') delete next.contact
      return next
    })
  }

  async function findFlights() {
    setFieldErrors({})
    dispatch({ type: 'flights-loading' })
    const reference = values.bookingReference.trim().toUpperCase()
    const surname = values.surname.trim()
    flightLookupAccess.current = { bookingReference: reference, surname }
    const request = { requestId: ++flightLookupRequest.current, bookingReference: reference, surname }
    const isCurrent = () => isCurrentFlightLookup(request, flightLookupRequest.current, flightLookupAccess.current)
    const accessErrors: Record<string, string> = {}
    if (!/^[A-Z0-9]{6}$/.test(reference)) accessErrors.bookingReference = 'Enter a valid six-character booking reference.'
    if (!surname) accessErrors.surname = 'Enter the surname on the booking.'
    else if (surname.length > 100) accessErrors.surname = 'Surname must be 100 characters or fewer.'
    if (Object.keys(accessErrors).length) {
      setFieldErrors(accessErrors)
      dispatch({ type: 'reset' })
      return
    }
    setValues((current) => ({ ...current, bookingReference: reference, surname }))

    try {
      const query = `bookingReference=${encodeURIComponent(reference)}&surname=${encodeURIComponent(surname)}`
      // "Whose bag is it?" is optional: if the traveller list cannot be loaded, the original own-bag flow carries on.
      const travellersRequest: Promise<EligibleTraveller[]> = fetchWithAuth(`/api/customer/lost-report-travellers?${query}`)
        .then(async (travellersResponse) => (travellersResponse.ok ? usableTravellers(await travellersResponse.json()) : []))
        .catch(() => [])
      const [response, travellers] = await Promise.all([fetchWithAuth(`/api/customer/lost-report-flights?${query}`), travellersRequest])
      if (!isCurrent()) return
      if (!response.ok) {
        // A wrong reference or surname is answered "Booking verification failed"; say so plainly, not "nothing flown yet".
        const message = caseRecoveryErrorMessage(await getResponseMessage(response, 'Eligible flights could not be loaded. Try again.'))
        if (!isCurrent()) return
        dispatch({
          type: 'flights-failed',
          message,
        })
        return
      }
      const flights = (await response.json()) as EligibleFlight[]
      if (!isCurrent()) return
      dispatch({ type: 'flights-loaded', flights })
      dispatch({ type: 'travellers-loaded', travellers: flights.length > 0 ? travellers : [] })
      setValues((current) => ({ ...current, flightId: '' }))
    } catch (cause) {
      if (!isCurrent()) return
      dispatch({
        type: 'flights-failed',
        message: cause instanceof Error ? cause.message : 'Eligible flights could not be loaded. Try again.',
      })
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionPending.current || pageState.submitState === 'submitting') return
    const errors = validateLostReportForm(values, availableFlights)
    setFieldErrors(errors)
    const fileError = validateLostReportPhoto(photo)
    if (fileError) setPhotoError(fileError)
    if (Object.keys(errors).length || photoError || fileError) return

    submissionPending.current = true
    dispatch({ type: 'submit-started' })
    try {
      const payload = buildCreateLostReportPayload(values, availableFlights, coTravellerId)
      const requestInit: RequestInit = photo
        ? { method: 'POST', body: buildCreateLostReportFormData(values, availableFlights, photo, coTravellerId) }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      const response = await fetchWithAuth('/api/customer/lost-reports', {
        ...requestInit,
      })
      if (!response.ok) {
        dispatch({
          type: 'submit-failed',
          message: await getResponseMessage(response, 'Your report could not be sent. Check the details and try again.'),
        })
        return
      }
      const created = (await response.json()) as CreatedReport
      if (!created.caseNumber) {
        dispatch({
          type: 'submit-failed',
          message:
            'The report was created, but the case number was missing from the response. Please check My bag case before submitting again.',
        })
        return
      }
      dispatch({ type: 'submit-succeeded', caseNumber: created.caseNumber })
      // The request has finished with the File; the success view replaces the form, so free its preview.
      showPhotoPreview(null)
    } catch (cause) {
      dispatch({
        type: 'submit-failed',
        message: cause instanceof Error ? cause.message : 'Your report could not be sent. Check the details and try again.',
      })
    } finally {
      submissionPending.current = false
    }
  }

  function openCreatedCase() {
    if (!pageState.caseNumber) return
    void navigate({
      to: '/lost-bag-case',
      state: (previous) => ({
        ...previous,
        passengerCaseAccess: {
          caseNumber: pageState.caseNumber,
          bookingReference: values.bookingReference.trim().toUpperCase(),
          surname: values.surname.trim(),
        },
      }),
    })
  }

  function reportAnotherBag() {
    setValues(EMPTY_VALUES)
    setFieldErrors({})
    setPhoto(null)
    showPhotoPreview(null)
    setPhotoError('')
    if (photoInput.current) photoInput.current.value = ''
    dispatch({ type: 'reset' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function selectPhoto(file: File | undefined) {
    if (!file) return
    const error = validateLostReportPhoto(file)
    if (error) {
      setPhoto(null)
      showPhotoPreview(null)
      setPhotoError(error)
      if (photoInput.current) photoInput.current.value = ''
      return
    }
    setPhoto(file)
    showPhotoPreview(file)
    setPhotoError('')
  }

  function handlePhotoDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    if (pageState.submitState !== 'submitting') selectPhoto(event.dataTransfer.files[0])
  }

  const selectedFlight = availableFlights.find((flight) => flight.flightId === values.flightId)
  const bookingFlightSummary = buildBookingFlightSummary(values.bookingReference, selectedFlight)

  return (
    <main className="passenger-report-page">
      <header className="passenger-report-page__intro">
        <h1>Report a lost bag</h1>
        <p>Tell us about the bag. Staff at every airport search for it, and you can follow the case online.</p>
      </header>

      {pageState.submitState === 'success' ? (
        <div className="passenger-report-success-layout">
          <section className="passenger-report-card passenger-report-success" aria-labelledby="report-success-title">
            <p className="passenger-report-success__eyebrow">Report sent</p>
            <h2 id="report-success-title">You’re all set</h2>
            <p>We’ve opened a case for your bag. Keep your case number to follow the search.</p>
            <div className="passenger-report-success__case-number" aria-label={`Case number ${pageState.caseNumber}`}>
              {pageState.caseNumber}
            </div>
            <dl className="passenger-report-success__summary">
              {bagOwnerName && (
                <>
                  <dt>Passenger</dt>
                  <dd>{bagOwnerName}</dd>
                </>
              )}
              <dt>Flight</dt>
              <dd>
                {selectedFlight
                  ? `${selectedFlight.flightNumber} · ${selectedFlight.origin} to ${selectedFlight.destination} · ${formatFlightDate(selectedFlight.serviceDate)}`
                  : 'Selected flight'}
              </dd>
              <dt>Bag</dt>
              <dd>
                {PASSENGER_BAG_TYPES.find(([type]) => type === values.bagType)?.[1]} ·{' '}
                {PASSENGER_BAG_COLOURS.find(([colour]) => colour === values.colour)?.[1]}
              </dd>
              {values.tagNumber.trim() && (
                <>
                  <dt>Tag</dt>
                  <dd>{values.tagNumber.trim()}</dd>
                </>
              )}
            </dl>
            {bagOwnerName && (
              <p className="passenger-report-success__note">
                Save this case number. You can follow this case under Find my cases with your booking reference and surname, and you can
                cancel it or choose where the bag goes.
              </p>
            )}
            <div className="passenger-report-success__actions">
              <Button type="button" onClick={openCreatedCase}>
                {bagOwnerName ? 'Open the case' : 'Open my case'}
              </Button>
              <Button variant="outline" type="button" onClick={reportAnotherBag}>
                Report another bag
              </Button>
            </div>
          </section>
          <WhatHappensNext />
        </div>
      ) : (
        <div className="passenger-report-layout">
          <form className="passenger-report-card passenger-report-form" onSubmit={(event) => void submitReport(event)} noValidate>
            <section className="passenger-report-form__section" aria-labelledby="report-booking-title">
              <div className="passenger-report-form__section-heading">
                <h2 id="report-booking-title">1. Find your booking</h2>
              </div>
              <div className="passenger-report-booking-lookup">
                <div className="passenger-report-fields passenger-report-fields--booking">
                  <Field id="report-booking-reference" label="Booking reference" error={fieldErrors.bookingReference}>
                    <Input
                      disabled={pageState.submitState === 'submitting'}
                      autoComplete="off"
                      maxLength={6}
                      value={values.bookingReference}
                      onChange={(event) => updateValue('bookingReference', event.currentTarget.value.toUpperCase())}
                      id="report-booking-reference"
                      aria-invalid={Boolean(fieldErrors.bookingReference)}
                      aria-describedby={fieldErrors.bookingReference ? 'report-booking-reference-error' : undefined}
                    />
                  </Field>
                  <Field id="report-surname" label="Surname" error={fieldErrors.surname}>
                    <Input
                      disabled={pageState.submitState === 'submitting'}
                      autoComplete="family-name"
                      maxLength={100}
                      value={values.surname}
                      onChange={(event) => updateValue('surname', event.currentTarget.value)}
                      id="report-surname"
                      aria-invalid={Boolean(fieldErrors.surname)}
                      aria-describedby={fieldErrors.surname ? 'report-surname-error' : undefined}
                    />
                  </Field>
                </div>
                <div className="passenger-report-booking-lookup__actions">
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={pageState.flightState === 'loading' || pageState.submitState === 'submitting'}
                    onClick={() => void findFlights()}
                  >
                    {pageState.flightState === 'loading' ? 'Finding…' : 'Find booking'}
                  </Button>
                  <p>Find your booking first. We check the reference and surname on every step.</p>
                </div>
              </div>
              {pageState.flightState === 'error' && (
                <Alert variant="destructive">
                  <AlertDescription>{pageState.flightError}</AlertDescription>
                </Alert>
              )}
              {pageState.flightState === 'loaded' && pageState.flights.length === 0 && (
                <Alert role="status">
                  <AlertDescription>
                    No eligible flights were found for those booking details. A lost bag can be reported once the flight has departed.
                  </AlertDescription>
                </Alert>
              )}
              {pageState.flights.length > 0 && (
                <>
                  {!bookingFlightSummary && (
                    <p className="passenger-report-booking-found" role="status">
                      Booking {values.bookingReference} found. Select a flight to continue.
                    </p>
                  )}
                  {showWhoseBag && (
                    <fieldset className="grid gap-2" disabled={pageState.submitState === 'submitting'}>
                      <legend className="mb-1 text-sm font-medium">Whose bag is it?</legend>
                      {fieldErrors.traveller && (
                        <p className="text-xs text-destructive" role="alert">
                          {fieldErrors.traveller}
                        </p>
                      )}
                      <RadioGroup
                        value={pageState.selectedTravellerId ?? ''}
                        onValueChange={selectTraveller}
                        disabled={pageState.submitState === 'submitting'}
                        aria-label="Whose bag is it?"
                      >
                        {pageState.travellers.map((traveller) => {
                          const itemId = `report-traveller-${traveller.bookingPassengerId}`
                          return (
                            <Label
                              key={traveller.bookingPassengerId}
                              htmlFor={itemId}
                              className="cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent"
                            >
                              <RadioGroupItem id={itemId} value={traveller.bookingPassengerId} />
                              <span className="flex-1 font-medium">
                                {traveller.displayName}
                                {traveller.isYou && <span className="font-normal text-muted-foreground"> (you)</span>}
                              </span>
                              <span className="text-xs font-normal text-muted-foreground">
                                {traveller.flights.map((flight) => flight.flightNumber).join(', ')}
                              </span>
                            </Label>
                          )
                        })}
                      </RadioGroup>
                    </fieldset>
                  )}
                  <div className="passenger-report-fields passenger-report-fields--flight">
                    <Field id="report-flight" label="Flight" error={fieldErrors.flightId}>
                      <Select
                        value={values.flightId}
                        onValueChange={(value) => updateValue('flightId', value)}
                        disabled={pageState.submitState === 'submitting'}
                        required
                      >
                        <SelectTrigger
                          id="report-flight"
                          aria-labelledby="report-flight-label"
                          aria-invalid={Boolean(fieldErrors.flightId)}
                          aria-describedby={fieldErrors.flightId ? 'report-flight-error' : undefined}
                        >
                          <SelectValue placeholder="Choose a flight" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Choose a flight</SelectItem>
                          {availableFlights.map((flight) => (
                            <SelectItem key={flight.flightId} value={flight.flightId}>
                              {flight.flightNumber} · {flight.origin} to {flight.destination} · {formatFlightDate(flight.serviceDate)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {bookingFlightSummary && (
                    <p className="passenger-report-booking-summary" role="status">
                      Booking {bookingFlightSummary.bookingReference} · {bookingFlightSummary.flightNumber} · {bookingFlightSummary.origin}{' '}
                      to {bookingFlightSummary.destination} ·{' '}
                      {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
                        new Date(bookingFlightSummary.serviceDate),
                      )}
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="passenger-report-form__section" aria-labelledby="report-bag-title">
              <div className="passenger-report-form__section-heading">
                <h2 id="report-bag-title">2. Your bag</h2>
              </div>
              <div className="passenger-report-fields">
                <Field id="report-bag-type" label="Bag type" error={fieldErrors.bagType}>
                  <Select
                    value={values.bagType}
                    onValueChange={(value) => updateValue('bagType', value)}
                    disabled={pageState.submitState === 'submitting'}
                    required
                  >
                    <SelectTrigger
                      id="report-bag-type"
                      aria-labelledby="report-bag-type-label"
                      aria-invalid={Boolean(fieldErrors.bagType)}
                      aria-describedby={fieldErrors.bagType ? 'report-bag-type-error' : undefined}
                    >
                      <SelectValue placeholder="Choose a bag type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Choose a bag type</SelectItem>
                      {PASSENGER_BAG_TYPES.map(([type, label]) => (
                        <SelectItem key={type} value={type}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="report-colour" label="Main colour" error={fieldErrors.colour}>
                  <Select
                    value={values.colour}
                    onValueChange={(value) => updateValue('colour', value)}
                    disabled={pageState.submitState === 'submitting'}
                    required
                  >
                    <SelectTrigger
                      id="report-colour"
                      aria-labelledby="report-colour-label"
                      aria-invalid={Boolean(fieldErrors.colour)}
                      aria-describedby={fieldErrors.colour ? 'report-colour-error' : undefined}
                    >
                      <SelectValue placeholder="Choose a colour" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Choose a colour</SelectItem>
                      {PASSENGER_BAG_COLOURS.map(([colour, label]) => (
                        <SelectItem key={colour} value={colour}>
                          <span
                            aria-hidden="true"
                            className="size-3.5 rounded-full border"
                            style={{ background: BAG_COLOUR_SWATCH[colour] }}
                          />
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="report-brand" label="Brand (if known)" error={fieldErrors.brand}>
                  <Input
                    disabled={pageState.submitState === 'submitting'}
                    maxLength={100}
                    placeholder="e.g. Samsonite"
                    value={values.brand}
                    onChange={(event) => updateValue('brand', event.currentTarget.value)}
                    id="report-brand"
                    aria-invalid={Boolean(fieldErrors.brand)}
                    aria-describedby={fieldErrors.brand ? 'report-brand-error' : undefined}
                  />
                </Field>
                <Field id="report-tag" label="Bag tag number (if you have it)" error={fieldErrors.tagNumber}>
                  <Input
                    disabled={pageState.submitState === 'submitting'}
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10 digits, e.g. 0789204578"
                    value={values.tagNumber}
                    onChange={(event) => updateValue('tagNumber', event.currentTarget.value.trim())}
                    id="report-tag"
                    aria-invalid={Boolean(fieldErrors.tagNumber)}
                    aria-describedby={fieldErrors.tagNumber ? 'report-tag-error' : undefined}
                  />
                </Field>
                <Field
                  className="passenger-report-fields__wide"
                  id="report-description"
                  label="Anything that makes it stand out"
                  error={fieldErrors.description}
                >
                  <Textarea
                    disabled={pageState.submitState === 'submitting'}
                    maxLength={1000}
                    rows={4}
                    value={values.description}
                    placeholder="Stickers, ribbons, a broken wheel, what was inside"
                    onChange={(event) => updateValue('description', event.currentTarget.value)}
                    id="report-description"
                    aria-invalid={Boolean(fieldErrors.description)}
                    aria-describedby={fieldErrors.description ? 'report-description-error' : undefined}
                  />
                </Field>
                <div className="passenger-report-photo passenger-report-fields__wide">
                  <label
                    className={`passenger-report-photo__dropzone${pageState.submitState === 'submitting' ? ' is-disabled' : ''}`}
                    htmlFor="lost-report-photo"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handlePhotoDrop}
                  >
                    <input
                      ref={photoInput}
                      id="lost-report-photo"
                      className="passenger-report-photo__input"
                      type="file"
                      accept={LOST_REPORT_PHOTO_ACCEPT}
                      disabled={pageState.submitState === 'submitting'}
                      onChange={(event) => selectPhoto(event.currentTarget.files?.[0])}
                      aria-describedby="lost-report-photo-help"
                    />
                    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" />
                    </svg>
                    <strong>Photo (optional)</strong>
                    <span id="lost-report-photo-help">
                      <span className="passenger-report-photo__desktop-help">
                        Drag a photo here or <span className="passenger-report-photo__browse">browse</span>. JPG or PNG, up to 10 MB.
                      </span>
                      <span className="passenger-report-photo__mobile-help">Tap to take or choose a photo. JPG or PNG, up to 10 MB.</span>
                    </span>
                  </label>
                  {photo && (
                    <div className="passenger-report-photo__selected" aria-live="polite">
                      {photoPreviewUrl && (
                        <Button
                          variant="outline"
                          size="icon-lg"
                          className="overflow-hidden p-0"
                          type="button"
                          aria-label="Enlarge selected photo"
                          aria-haspopup="dialog"
                          onClick={() => setIsPhotoEnlarged(true)}
                        >
                          <img className="passenger-report-photo__preview" src={photoPreviewUrl} alt="" />
                        </Button>
                      )}
                      <span title={photo.name}>{photo.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={pageState.submitState === 'submitting'}
                        onClick={() => {
                          setPhoto(null)
                          showPhotoPreview(null)
                          setPhotoError('')
                          if (photoInput.current) photoInput.current.value = ''
                        }}
                      >
                        Remove photo
                      </Button>
                    </div>
                  )}
                  {photoError && (
                    <p className="passenger-report-photo__error" role="alert">
                      {photoError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="passenger-report-form__section" aria-labelledby="report-contact-title">
              <div className="passenger-report-form__section-heading">
                <h2 id="report-contact-title">3. How we reach you</h2>
              </div>
              <div className="passenger-report-fields">
                <Field id="report-email" label="Email" error={fieldErrors.contactEmail}>
                  <Input
                    disabled={pageState.submitState === 'submitting'}
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    placeholder="you@example.com"
                    value={values.contactEmail}
                    onChange={(event) => updateValue('contactEmail', event.currentTarget.value)}
                    id="report-email"
                    aria-invalid={Boolean(fieldErrors.contactEmail)}
                    aria-describedby={fieldErrors.contactEmail ? 'report-email-error' : undefined}
                  />
                </Field>
                <Field id="report-phone" label="Phone" error={fieldErrors.contactPhone}>
                  <Input
                    disabled={pageState.submitState === 'submitting'}
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    placeholder="+66 …"
                    value={values.contactPhone}
                    onChange={(event) => updateValue('contactPhone', event.currentTarget.value)}
                    id="report-phone"
                    aria-invalid={Boolean(fieldErrors.contactPhone)}
                    aria-describedby={fieldErrors.contactPhone ? 'report-phone-error' : undefined}
                  />
                </Field>
              </div>
              {fieldErrors.contact && (
                <p className="passenger-report-field__error" role="alert">
                  {fieldErrors.contact}
                </p>
              )}
              <p className="passenger-report-form__hint">Give at least one. We only use it for this case.</p>
              {pageState.submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{pageState.submitError}</AlertDescription>
                </Alert>
              )}
              <div className="passenger-report-form__submit-row">
                <Button
                  type="submit"
                  disabled={pageState.submitState === 'submitting' || pageState.flightState !== 'loaded' || pageState.flights.length === 0}
                >
                  {pageState.submitState === 'submitting' ? (photo ? 'Sending photo and report…' : 'Sending report…') : 'Send report'}
                </Button>
              </div>
            </section>
          </form>
          <aside className="passenger-report-sidebar">
            <WhatHappensNext />
            <Card className="passenger-report-card passenger-report-existing gap-0 py-0">
              <h2>Already reported?</h2>
              <p>Open My bag case with your case number, booking reference and surname.</p>
              <Button asChild variant="outline">
                <Link to="/lost-bag-case">Check my case</Link>
              </Button>
            </Card>
          </aside>
        </div>
      )}
      {photoPreviewUrl && (
        <Dialog open={isPhotoEnlarged} onOpenChange={setIsPhotoEnlarged}>
          <DialogContent className="sm:max-w-3xl">
            <DialogTitle>Selected photo</DialogTitle>
            <DialogDescription className="sr-only">Enlarged preview of the photo you selected.</DialogDescription>
            <img className="max-h-[70vh] w-full rounded-md object-contain" src={photoPreviewUrl} alt="Selected photo, enlarged" />
          </DialogContent>
        </Dialog>
      )}
    </main>
  )
}

function WhatHappensNext() {
  return (
    <Card className="passenger-report-card passenger-report-next gap-0 py-0">
      <h2>What happens next</h2>
      <ol>
        <li>
          <span>1</span>
          <p>You get a case number right away.</p>
        </li>
        <li>
          <span>2</span>
          <p>Staff compare your report with every bag found at our airports.</p>
        </li>
        <li>
          <span>3</span>
          <p>Once staff confirm the bag, you choose home, hotel, another address or airport pickup.</p>
        </li>
        <li>
          <span>4</span>
          <p>We pay for sending it to you. You never pay.</p>
        </li>
      </ol>
    </Card>
  )
}
