import { useReducer, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import {
  buildCreateLostReportPayload,
  createLostReportPageState,
  lostReportPageReducer,
  PASSENGER_BAG_COLOURS,
  PASSENGER_BAG_TYPES,
  isCurrentFlightLookup,
  validateLostReportForm,
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
    if (Object.keys(errors).length) return

    submissionPending.current = true
    dispatch({ type: 'submit-started' })
    try {
      const payload = buildCreateLostReportPayload(values, pageState.flights)
      const response = await fetchWithAuth('/api/customer/lost-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    dispatch({ type: 'reset' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const selectedFlight = pageState.flights.find((flight) => flight.flightId === values.flightId)

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
              <button className="passenger-report-button passenger-report-button--secondary" type="button" onClick={reportAnotherBag}>
                Report another bag
              </button>
              <button className="passenger-report-button" type="button" onClick={openCreatedCase}>
                Open my case
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
                <span>1</span>
                <h2 id="report-booking-title">Find your booking</h2>
              </div>
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
                <button
                  className="passenger-report-button passenger-report-button--find"
                  type="button"
                  disabled={pageState.flightState === 'loading' || pageState.submitState === 'submitting'}
                  onClick={() => void findFlights()}
                >
                  {pageState.flightState === 'loading' ? 'Finding…' : 'Find booking'}
                </button>
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
              )}
            </section>

            <section className="passenger-report-form__section" aria-labelledby="report-bag-title">
              <div className="passenger-report-form__section-heading">
                <span>2</span>
                <h2 id="report-bag-title">Tell us about the bag</h2>
              </div>
              <div className="passenger-report-fields">
                <Field label="Bag type" error={fieldErrors.bagType}>
                  <select
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
                  <select
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
                </Field>
                <Field label="Baggage tag (optional)" error={fieldErrors.tagNumber}>
                  <input
                    disabled={pageState.submitState === 'submitting'}
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={10}
                    value={values.tagNumber}
                    onChange={(event) => updateValue('tagNumber', event.currentTarget.value.trim())}
                    aria-invalid={Boolean(fieldErrors.tagNumber)}
                  />
                </Field>
                <Field label="Brand (optional)" error={fieldErrors.brand}>
                  <input
                    disabled={pageState.submitState === 'submitting'}
                    maxLength={100}
                    value={values.brand}
                    onChange={(event) => updateValue('brand', event.currentTarget.value)}
                    aria-invalid={Boolean(fieldErrors.brand)}
                  />
                </Field>
                <Field className="passenger-report-fields__wide" label="Description (optional)" error={fieldErrors.description}>
                  <textarea
                    disabled={pageState.submitState === 'submitting'}
                    maxLength={1000}
                    rows={4}
                    value={values.description}
                    onChange={(event) => updateValue('description', event.currentTarget.value)}
                    aria-invalid={Boolean(fieldErrors.description)}
                  />
                </Field>
              </div>
            </section>

            <section className="passenger-report-form__section" aria-labelledby="report-contact-title">
              <div className="passenger-report-form__section-heading">
                <span>3</span>
                <h2 id="report-contact-title">How can we contact you?</h2>
              </div>
              <p className="passenger-report-form__hint">Enter at least one contact method.</p>
              <div className="passenger-report-fields">
                <Field label="Email" error={fieldErrors.contactEmail}>
                  <input
                    disabled={pageState.submitState === 'submitting'}
                    type="email"
                    autoComplete="email"
                    maxLength={254}
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
                  {pageState.submitState === 'submitting' ? 'Sending report…' : 'Send report'}
                </button>
              </div>
            </section>
          </form>
          <aside className="passenger-report-sidebar">
            <WhatHappensNext />
            <section className="passenger-report-card passenger-report-existing">
              <h2>Already reported?</h2>
              <p>Open your case to see updates from the baggage team.</p>
              <Link to="/lost-bag-case">Open my case</Link>
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
          <div>
            <strong>We search</strong>
            <p>Staff at every airport check for bags matching your description.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>We confirm it’s yours</strong>
            <p>We’ll contact you when staff find a possible match.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>You follow your case</strong>
            <p>Use your case number to see updates online.</p>
          </div>
        </li>
      </ol>
    </section>
  )
}
