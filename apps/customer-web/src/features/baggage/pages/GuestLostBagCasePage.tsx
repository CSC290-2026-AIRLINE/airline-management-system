import { useRef, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { caseProgressPresentation, caseStatusLabel, shouldShowNoOpenCase } from './case-page-presentation'
import { defaultGuestApiOptions, lookUpGuestCase, type GuestApiOptions } from './guest-report-api'
import {
  guestDeliveryNote,
  guestDeliveryStatusLabel,
  guestTimelineLabel,
  validateGuestCaseLookup,
  type GuestCaseSummary,
} from './guest-case-tracking'
import './PassengerLostBagCasePage.css'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatServiceDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}

function capitalize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase())
}

/**
 * Guest (no-account) case tracking, read only: the same "My bag case" layout as the signed-in page, opened with the case
 * number, booking reference and surname. Booking details live only in this component's state; they are never put in
 * the URL or browser storage. Guests get no case actions (no delivery choice, no cancellation).
 */
export function GuestLostBagCasePage({
  initialCaseNumber = '',
  guestApi = defaultGuestApiOptions(),
}: {
  initialCaseNumber?: string
  guestApi?: GuestApiOptions
}) {
  const [caseNumber, setCaseNumber] = useState(initialCaseNumber)
  const [bookingReference, setBookingReference] = useState('')
  const [surname, setSurname] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<GuestCaseSummary | null>(null)
  const lookupRequest = useRef(0)

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Every new submission first clears the case on screen, so a case opened earlier never stays visible beside details
    // that were not verified (including when this submission fails validation below).
    setSummary(null)
    const input = { caseNumber, bookingReference, surname }
    const errors = validateGuestCaseLookup(input)
    setFieldErrors(errors)
    setError('')
    if (Object.keys(errors).length > 0) return

    const requestId = ++lookupRequest.current
    setIsLookingUp(true)
    const result = await lookUpGuestCase(input, guestApi)
    if (requestId !== lookupRequest.current) return
    setIsLookingUp(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setSummary(result.summary)
  }

  const deliveryStatus = summary?.delivery?.status ?? null
  const progress = summary ? caseProgressPresentation(summary.status, deliveryStatus) : { steps: [], activeStep: 0 }
  const displayedCaseStatus = summary ? caseStatusLabel(summary.status, deliveryStatus) : ''
  const isTimedOutCase = progress.steps[0] === 'Reported'

  return (
    <main className="passenger-case-page">
      <header className="passenger-case-page__intro">
        <h1>My bag case</h1>
        <p>Enter your case number with your booking reference and surname. A case number alone does not open a case.</p>
      </header>

      <section className="passenger-case-access" aria-label="Open a baggage case">
        <form
          aria-label="Open a baggage case"
          className="passenger-case-access__form"
          onSubmit={(event) => void handleLookup(event)}
          noValidate
        >
          <label>
            <span>Case number</span>
            <input
              autoComplete="off"
              required
              maxLength={14}
              disabled={isLookingUp}
              value={caseNumber}
              onChange={(event) => setCaseNumber(event.currentTarget.value)}
              placeholder="LB-2026-000118"
              aria-invalid={Boolean(fieldErrors.caseNumber)}
            />
          </label>
          <label>
            <span>Booking reference</span>
            <input
              autoComplete="off"
              required
              maxLength={6}
              disabled={isLookingUp}
              value={bookingReference}
              onChange={(event) => setBookingReference(event.currentTarget.value.toUpperCase())}
              placeholder="ABC123"
              aria-invalid={Boolean(fieldErrors.bookingReference)}
            />
          </label>
          <label>
            <span>Surname</span>
            <input
              autoComplete="family-name"
              required
              maxLength={100}
              disabled={isLookingUp}
              value={surname}
              onChange={(event) => setSurname(event.currentTarget.value)}
              placeholder="Surname on booking"
              aria-invalid={Boolean(fieldErrors.surname)}
            />
          </label>
          <button type="submit" disabled={isLookingUp}>
            {isLookingUp ? 'Opening…' : 'Open case'}
          </button>
        </form>
        {Object.values(fieldErrors).map((message) => (
          <p className="passenger-case-page__error" role="alert" key={message}>
            {message}
          </p>
        ))}
        {error && (
          <p className="passenger-case-page__error" role="alert">
            {error}
          </p>
        )}
        {isLookingUp && (
          <p className="passenger-case-page__loading" role="status">
            Loading case details…
          </p>
        )}
      </section>

      {shouldShowNoOpenCase(Boolean(summary), isLookingUp, Boolean(error)) && (
        <section className="passenger-case-empty" aria-labelledby="passenger-case-empty-title">
          <h2 id="passenger-case-empty-title">No case open yet</h2>
          <p>Enter your case details above to follow a report. If you have not reported a bag yet, start here.</p>
          <Link className="passenger-case-empty__link" to="/report-lost-bag">
            Report a lost bag
          </Link>
        </section>
      )}

      {summary && (
        <div className="passenger-case-layout">
          <section className="passenger-case-card" aria-labelledby="passenger-case-title">
            <header className="passenger-case-card__heading">
              <h2 id="passenger-case-title">{summary.caseNumber}</h2>
              <span
                className={`passenger-case-card__status${displayedCaseStatus === 'Open' ? ' passenger-case-card__status--open' : ''}${displayedCaseStatus === 'Lost' ? ' passenger-case-card__status--lost' : ''}`}
              >
                {displayedCaseStatus}
              </span>
            </header>

            <ol
              className={`passenger-case-progress${isTimedOutCase ? ' passenger-case-progress--lost' : ''}`}
              aria-label="Baggage recovery progress"
            >
              {progress.steps.map((step, index) => {
                const activeStep = progress.activeStep
                const className =
                  index < activeStep
                    ? 'passenger-case-progress__step passenger-case-progress__step--complete'
                    : index === activeStep
                      ? 'passenger-case-progress__step passenger-case-progress__step--current'
                      : 'passenger-case-progress__step'

                return (
                  <li aria-current={index === activeStep ? 'step' : undefined} className={className} key={step}>
                    <span className="passenger-case-progress__marker">{index < activeStep ? '✓' : index + 1}</span>
                    <span>{step}</span>
                  </li>
                )
              })}
            </ol>

            <dl className="passenger-case-card__details">
              <dt>Flight</dt>
              <dd>
                {summary.flight.flightNumber} · {summary.flight.origin} to {summary.flight.destination} ·{' '}
                {formatServiceDate(summary.flight.serviceDate)}
              </dd>
              <dt>Bag</dt>
              <dd>{[capitalize(summary.bag.colour), summary.bag.type.replaceAll('_', ' ')].join(' · ')}</dd>
              {summary.delivery && (
                <>
                  <dt>Delivery</dt>
                  <dd>
                    <span className="passenger-case-card__delivery-status">{guestDeliveryStatusLabel(summary.delivery.status)}</span>
                  </dd>
                </>
              )}
            </dl>

            {isTimedOutCase && (
              <p className="passenger-case-timeout" role="status">
                Your bag was not found within 21 days.
                {summary.lostAt && (
                  <>
                    {' '}
                    Marked lost <time dateTime={summary.lostAt}>{formatDate(summary.lostAt)}</time>.
                  </>
                )}
              </p>
            )}

            <h3>Timeline</h3>
            <ol className="passenger-case-timeline">
              {summary.timeline.map((event, index) => (
                <li key={`${event.type}-${event.occurredAt}-${index}`}>
                  <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                  <span>{guestTimelineLabel(event.type)}</span>
                </li>
              ))}
            </ol>
            {summary.timeline.length === 0 && (
              <p className="passenger-case-page__loading" role="status">
                No recovery updates have been recorded yet.
              </p>
            )}
          </section>

          <aside className="passenger-case-delivery">
            <section className="passenger-case-info" role="status">
              <h2>Delivery</h2>
              <p>{guestDeliveryNote(summary)}</p>
            </section>
          </aside>
        </div>
      )}
    </main>
  )
}
