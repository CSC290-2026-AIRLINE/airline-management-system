import { useReducer, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import {
  buildCreateLostReportPayload,
  buildCreateLostReportFormData,
  buildBookingFlightSummary,
  createLostReportPageState,
  lostReportPageReducer,
  PASSENGER_BAG_COLOURS,
  PASSENGER_BAG_TYPES,
  isCurrentFlightLookup,
  LOST_REPORT_PHOTO_ACCEPT,
  validateLostReportForm,
  validateLostReportPhoto,
  type EligibleFlight,
  type LostBagFormValues,
} from './lost-report-form'
import './PassengerLostBagReportPage.css'

interface ApiErrorBody {
  message?: string | string[]
}

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
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null
  if (response.status === 401) return 'Your sign-in has expired. Sign in again and retry.'
  if (response.status === 403) return 'This customer account is not authorized to use those booking details.'
  if (Array.isArray(body?.message)) return body.message.join(' ')
  return body?.message || fallback
}

function formatFlightDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export function PassengerLostBagReportPage() {
  const { fetchWithAuth } = useAppAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<LostBagFormValues>(EMPTY_VALUES)
  const [pageState, dispatch] = useReducer(lostReportPageReducer, undefined, createLostReportPageState)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState('')
  const photoInput = useRef<HTMLInputElement>(null)
  const submissionPending = useRef(false)
  const flightLookupRequest = useRef(0)
  const flightLookupAccess = useRef({ bookingReference: '', surname: '' })

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
      const response = await fetchWithAuth(`/api/customer/lost-report-flights?${query}`)
      if (!isCurrent()) return
      if (!response.ok) {
        const message = await getResponseMessage(response, 'Eligible flights could not be loaded. Try again.')
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
    const errors = validateLostReportForm(values, pageState.flights)
    setFieldErrors(errors)
    const fileError = validateLostReportPhoto(photo)
    if (fileError) setPhotoError(fileError)
    if (Object.keys(errors).length || photoError || fileError) return

    submissionPending.current = true
    dispatch({ type: 'submit-started' })
    try {
      const payload = buildCreateLostReportPayload(values, pageState.flights)
      const requestInit: RequestInit = photo
        ? { method: 'POST', body: buildCreateLostReportFormData(values, pageState.flights, photo) }
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
      setPhotoError(error)
      if (photoInput.current) photoInput.current.value = ''
      return
    }
    setPhoto(file)
    setPhotoError('')
  }

  function handlePhotoDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    if (pageState.submitState !== 'submitting') selectPhoto(event.dataTransfer.files[0])
  }

  const selectedFlight = pageState.flights.find((flight) => flight.flightId === values.flightId)
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
            <div className="passenger-report-success__actions">
              <button className="passenger-report-button" type="button" onClick={openCreatedCase}>
                Open my case
              </button>
              <button className="passenger-report-button passenger-report-button--secondary" type="button" onClick={reportAnotherBag}>
                Report another bag
              </button>
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
                  <Field label="Booking reference" error={fieldErrors.bookingReference}>
                    <input
                      disabled={pageState.submitState === 'submitting'}
                      autoComplete="off"
                      maxLength={6}
                      value={values.bookingReference}
                      onChange={(event) => updateValue('bookingReference', event.currentTarget.value.toUpperCase())}
                      aria-invalid={Boolean(fieldErrors.bookingReference)}
                    />
                  </Field>
                  <Field label="Surname" error={fieldErrors.surname}>
                    <input
                      disabled={pageState.submitState === 'submitting'}
                      autoComplete="family-name"
                      maxLength={100}
                      value={values.surname}
                      onChange={(event) => updateValue('surname', event.currentTarget.value)}
                      aria-invalid={Boolean(fieldErrors.surname)}
                    />
                  </Field>
                </div>
                <div className="passenger-report-booking-lookup__actions">
                  <button
                    className="passenger-report-button passenger-report-button--find"
                    type="button"
                    disabled={pageState.flightState === 'loading' || pageState.submitState === 'submitting'}
                    onClick={() => void findFlights()}
                  >
                    {pageState.flightState === 'loading' ? 'Finding…' : 'Find booking'}
                  </button>
                  <p>Find your booking first. We check the reference and surname on every step.</p>
                </div>
              </div>
              {pageState.flightState === 'error' && (
                <p className="passenger-report-message passenger-report-message--error" role="alert">
                  {pageState.flightError}
                </p>
              )}
              {pageState.flightState === 'loaded' && pageState.flights.length === 0 && (
                <p className="passenger-report-message" role="status">
                  No eligible flights were found for those booking details.
                </p>
              )}
              {pageState.flights.length > 0 && (
                <>
                  {!bookingFlightSummary && (
                    <p className="passenger-report-booking-found" role="status">
                      Booking {values.bookingReference} found. Select a flight to continue.
                    </p>
                  )}
                  <div className="passenger-report-fields passenger-report-fields--flight">
                    <Field label="Flight" error={fieldErrors.flightId}>
                      <select
                        disabled={pageState.submitState === 'submitting'}
                        required
                        value={values.flightId}
                        onChange={(event) => updateValue('flightId', event.currentTarget.value)}
                        aria-invalid={Boolean(fieldErrors.flightId)}
                      >
                        <option value="">Choose a flight</option>
                        {pageState.flights.map((flight) => (
                          <option key={flight.flightId} value={flight.flightId}>
                            {flight.flightNumber} · {flight.origin} to {flight.destination} · {formatFlightDate(flight.serviceDate)}
                          </option>
                        ))}
                      </select>
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
                <Field label="Bag type" error={fieldErrors.bagType}>
                  <select
                    className="passenger-report-select--chevron-inset"
                    disabled={pageState.submitState === 'submitting'}
                    required
                    value={values.bagType}
                    onChange={(event) => updateValue('bagType', event.currentTarget.value)}
                    aria-invalid={Boolean(fieldErrors.bagType)}
                  >
                    <option value="">Choose a bag type</option>
                    {PASSENGER_BAG_TYPES.map(([type, label]) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Main colour" error={fieldErrors.colour}>
                  <span className={`passenger-report-colour-select${values.colour ? ' passenger-report-colour-select--selected' : ''}`}>
                    {values.colour && (
                      <span
                        aria-hidden="true"
                        className="passenger-report-colour-select__swatch"
                        style={{ background: BAG_COLOUR_SWATCH[values.colour as keyof typeof BAG_COLOUR_SWATCH] }}
                      />
                    )}
                    <select
                      className="passenger-report-select--chevron-inset"
                      disabled={pageState.submitState === 'submitting'}
                      required
                      value={values.colour}
                      onChange={(event) => updateValue('colour', event.currentTarget.value)}
                      aria-invalid={Boolean(fieldErrors.colour)}
                    >
                      <option value="">Choose a colour</option>
                      {PASSENGER_BAG_COLOURS.map(([colour, label]) => (
                        <option key={colour} value={colour}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </span>
                </Field>
                <Field label="Brand (if known)" error={fieldErrors.brand}>
                  <input
                    disabled={pageState.submitState === 'submitting'}
                    maxLength={100}
                    placeholder="e.g. Samsonite"
                    value={values.brand}
                    onChange={(event) => updateValue('brand', event.currentTarget.value)}
                    aria-invalid={Boolean(fieldErrors.brand)}
                  />
                </Field>
                <Field label="Bag tag number (if you have it)" error={fieldErrors.tagNumber}>
                  <input
                    disabled={pageState.submitState === 'submitting'}
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10 digits, e.g. 0789204578"
                    value={values.tagNumber}
                    onChange={(event) => updateValue('tagNumber', event.currentTarget.value.trim())}
                    aria-invalid={Boolean(fieldErrors.tagNumber)}
                  />
                </Field>
                <Field className="passenger-report-fields__wide" label="Anything that makes it stand out" error={fieldErrors.description}>
                  <textarea
                    disabled={pageState.submitState === 'submitting'}
                    maxLength={1000}
                    rows={4}
                    value={values.description}
                    placeholder="Stickers, ribbons, a broken wheel, what was inside"
                    onChange={(event) => updateValue('description', event.currentTarget.value)}
                    aria-invalid={Boolean(fieldErrors.description)}
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
                      <span title={photo.name}>{photo.name}</span>
                      <button
                        className="passenger-report-photo__remove"
                        type="button"
                        disabled={pageState.submitState === 'submitting'}
                        onClick={() => {
                          setPhoto(null)
                          setPhotoError('')
                          if (photoInput.current) photoInput.current.value = ''
                        }}
                      >
                        Remove photo
                      </button>
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
                <Field label="Email" error={fieldErrors.contactEmail}>
                  <input
                    disabled={pageState.submitState === 'submitting'}
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    placeholder="you@example.com"
                    value={values.contactEmail}
                    onChange={(event) => updateValue('contactEmail', event.currentTarget.value)}
                    aria-invalid={Boolean(fieldErrors.contactEmail)}
                  />
                </Field>
                <Field label="Phone" error={fieldErrors.contactPhone}>
                  <input
                    disabled={pageState.submitState === 'submitting'}
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    placeholder="+66 …"
                    value={values.contactPhone}
                    onChange={(event) => updateValue('contactPhone', event.currentTarget.value)}
                    aria-invalid={Boolean(fieldErrors.contactPhone)}
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
                <p className="passenger-report-message passenger-report-message--error" role="alert">
                  {pageState.submitError}
                </p>
              )}
              <div className="passenger-report-form__submit-row">
                <button
                  className="passenger-report-button"
                  type="submit"
                  disabled={pageState.submitState === 'submitting' || pageState.flightState !== 'loaded' || pageState.flights.length === 0}
                >
                  {pageState.submitState === 'submitting' ? (photo ? 'Sending photo and report…' : 'Sending report…') : 'Send report'}
                </button>
              </div>
            </section>
          </form>
          <aside className="passenger-report-sidebar">
            <WhatHappensNext />
            <section className="passenger-report-card passenger-report-existing">
              <h2>Already reported?</h2>
              <p>Open My bag case with your case number, booking reference and surname.</p>
              <Link to="/lost-bag-case">Check my case</Link>
            </section>
          </aside>
        </div>
      )}
    </main>
  )
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`passenger-report-field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
      {error && (
        <small className="passenger-report-field__error" role="alert">
          {error}
        </small>
      )}
    </label>
  )
}

function WhatHappensNext() {
  return (
    <section className="passenger-report-card passenger-report-next">
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
          <p>Once staff confirm it is your bag, you choose home, hotel, another address or airport pickup.</p>
        </li>
        <li>
          <span>4</span>
          <p>We pay for sending it to you. You never pay.</p>
        </li>
      </ol>
    </section>
  )
}
