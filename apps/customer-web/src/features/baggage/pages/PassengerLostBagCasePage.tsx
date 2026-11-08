import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import { DeliveryChoiceForm, type PassengerDeliveryChoice } from '../components/DeliveryChoiceForm'
import { createPassengerCasePageState, isCurrentCaseRequest, passengerCasePageReducer, passengerDeliveryFormKey } from './case-page-state'
import { timelineEventLabel, type PassengerCaseTimelineEvent } from './passenger-case-summary-view'
import './PassengerLostBagCasePage.css'

interface CaseAccess {
  caseNumber: string
  bookingReference: string
  surname: string
}

interface LostBagReportDetail {
  caseNumber: string
  bagType: string
  colour: string
  brand: string | null
  tagNumber: string | null
  description: string | null
  status: string
  reportedAt: string
  lostAt: string | null
  closedAt: string | null
}

interface PassengerCaseSummary {
  passenger: { firstName: string; lastName: string }
  flight: { flightNumber: string; serviceDate: string; origin: string; destination: string }
  timeline: PassengerCaseTimelineEvent[]
}

interface LostBagReportListItem {
  caseNumber: string
}

type DeliveryType = PassengerDeliveryChoice['deliveryType'] | 'airport_pickup'
type DeliveryStatus = 'waiting_choice' | 'preparing' | 'in_transit' | 'ready_for_pickup' | 'delivered'

interface DeliveryChoiceState {
  deliveryType: DeliveryType | null
  address: string | null
  pickupAirport: string | null
  status: DeliveryStatus
}

interface DeliveryChoiceUpdate extends DeliveryChoiceState {
  deliveryType: DeliveryType
  address: string | null
  pickupAirport: string | null
}

interface ApiErrorBody {
  message?: string | string[]
  code?: string
}

const EDITABLE_DELIVERY_STATUSES: DeliveryStatus[] = ['waiting_choice', 'preparing']
const RECOVERY_REPORT_STATUSES = ['matched', 'delivering', 'lost']
const CASE_NUMBER_PATTERN = /^LB-\d{4}-\d{6}$/i
const PROGRESS_STEPS = ['Searching', 'Bag found', 'On its way', 'Back with you']

const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  home: 'Home',
  hotel: 'Hotel',
  other_address: 'Other address',
  airport_pickup: 'Airport pickup',
}

function accessQuery(access: CaseAccess): string {
  return `bookingReference=${encodeURIComponent(access.bookingReference)}&surname=${encodeURIComponent(access.surname)}`
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null

  if (response.status === 401) return 'Your sign-in has expired. Sign in again, then reopen this case.'
  if (response.status === 403) return 'This customer account is not authorized to open this case.'
  if (Array.isArray(body?.message)) return body.message.join(' ')
  return body?.message || fallback
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatServiceDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}

function formatStatus(status: string): string {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function caseStatusLabel(report: LostBagReportDetail, delivery: DeliveryChoiceState | null): string {
  if (report.status === 'cancelled') return 'Cancelled'
  if (report.status === 'closed' || delivery?.status === 'delivered') return 'Back with you'
  if (report.status === 'delivering' || delivery?.status === 'in_transit' || delivery?.status === 'ready_for_pickup') {
    return 'Being delivered'
  }
  if (report.status === 'matched' || delivery) return 'Owner confirmed'
  if (report.status === 'open' || report.status === 'lost') return 'Searching'

  return formatStatus(report.status)
}

function deliveryStatusLabel(status: DeliveryStatus): string {
  const labels: Record<DeliveryStatus, string> = {
    waiting_choice: 'Waiting for passenger',
    preparing: 'Preparing',
    in_transit: 'In transit',
    ready_for_pickup: 'Ready for pickup',
    delivered: 'Delivered',
  }

  return labels[status]
}

function progressStep(report: LostBagReportDetail, delivery: DeliveryChoiceState | null): number {
  if (report.status === 'closed' || delivery?.status === 'delivered') return 3
  if (report.status === 'delivering' || delivery?.status === 'in_transit' || delivery?.status === 'ready_for_pickup') return 2
  if (report.status === 'matched' || delivery) return 1

  return 0
}

function deliveryDestination(delivery: DeliveryChoiceState): string | null {
  if (!delivery.deliveryType) return null
  if (delivery.deliveryType === 'airport_pickup') {
    return delivery.pickupAirport ? `${DELIVERY_TYPE_LABELS.airport_pickup}: ${delivery.pickupAirport}` : null
  }

  return delivery.address ? `${DELIVERY_TYPE_LABELS[delivery.deliveryType]}: ${delivery.address}` : null
}

function TryCaseChips({ cases, currentCase, onOpen }: { cases: string[]; currentCase: string; onOpen: (caseNumber: string) => void }) {
  if (cases.length === 0) return null

  return (
    <div className="passenger-case-access__suggestions" role="group" aria-label="Other baggage cases">
      <span>Try:</span>
      {cases.map((caseItem) => (
        <button aria-pressed={caseItem === currentCase} key={caseItem} type="button" onClick={() => onOpen(caseItem)}>
          {caseItem}
        </button>
      ))}
    </div>
  )
}

function toInitialChoice(delivery: DeliveryChoiceState): PassengerDeliveryChoice | undefined {
  if (delivery.deliveryType === 'airport_pickup') {
    return delivery.pickupAirport ? { deliveryType: 'airport_pickup', pickupAirport: delivery.pickupAirport } : undefined
  }

  if (delivery.deliveryType && delivery.address) {
    return { deliveryType: delivery.deliveryType, address: delivery.address }
  }

  return undefined
}

export function PassengerLostBagCasePage() {
  const { fetchWithAuth } = useAppAuth()
  const location = useLocation()
  const openedFromReport = useRef(false)
  const caseRequestGeneration = useRef(0)
  const caseSummaryRequest = useRef(0)
  const [caseNumber, setCaseNumber] = useState('')
  const [bookingReference, setBookingReference] = useState('')
  const [surname, setSurname] = useState('')
  const [access, setAccess] = useState<CaseAccess | null>(null)
  const [casePage, dispatchCasePage] = useReducer(
    passengerCasePageReducer<LostBagReportDetail, DeliveryChoiceState>,
    createPassengerCasePageState<LostBagReportDetail, DeliveryChoiceState>(),
  )
  const { report, delivery, deliveryUnavailable: isDeliveryUnavailable, deliveryError, deliveryFormRevision } = casePage
  const [caseSummary, setCaseSummary] = useState<PassengerCaseSummary | null>(null)
  const [caseSummaryError, setCaseSummaryError] = useState('')
  const [caseSummaryLoading, setCaseSummaryLoading] = useState(false)
  const [relatedCases, setRelatedCases] = useState<string[]>([])
  const [caseListMessage, setCaseListMessage] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingAccess, setIsEditingAccess] = useState(true)
  const [saveNotice, setSaveNotice] = useState('')
  const [error, setError] = useState('')

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaveNotice('')

    const requestAccess = {
      caseNumber: caseNumber.trim().toUpperCase(),
      bookingReference: bookingReference.trim().toUpperCase(),
      surname: surname.trim(),
    }

    if (!CASE_NUMBER_PATTERN.test(requestAccess.caseNumber)) {
      setError('Enter a valid case number, such as LB-2026-000118.')
      return
    }
    if (!/^[A-Z0-9]{6}$/.test(requestAccess.bookingReference)) {
      setError('Enter the six-character booking reference.')
      return
    }
    if (!requestAccess.surname) {
      setError('Enter the surname on the booking.')
      return
    }

    await loadCase(requestAccess)
  }

  async function loadCase(requestAccess: CaseAccess) {
    const requestId = ++caseRequestGeneration.current
    caseSummaryRequest.current += 1
    const isCurrent = () => isCurrentCaseRequest(requestId, caseRequestGeneration.current)
    const normalizedAccess = {
      ...requestAccess,
      caseNumber: requestAccess.caseNumber.trim().toUpperCase(),
      bookingReference: requestAccess.bookingReference.trim().toUpperCase(),
      surname: requestAccess.surname.trim(),
    }

    setIsLookingUp(true)
    setIsSaving(false)
    setError('')
    dispatchCasePage({ type: 'reset' })
    setCaseSummary(null)
    setCaseSummaryError('')
    setCaseSummaryLoading(false)
    setAccess(null)
    setRelatedCases([])
    setCaseListMessage('')
    setCaseNumber(normalizedAccess.caseNumber)
    setBookingReference(normalizedAccess.bookingReference)
    setSurname(normalizedAccess.surname)
    try {
      const query = accessQuery(normalizedAccess)
      const casePath = `/api/customer/lost-reports/${encodeURIComponent(normalizedAccess.caseNumber)}`
      const [reportResponse, listResponse] = await Promise.all([
        fetchWithAuth(`${casePath}?${query}`),
        fetchWithAuth(`/api/customer/lost-reports?${query}`),
      ])
      if (!isCurrent()) return

      if (!reportResponse.ok) {
        const message =
          reportResponse.status === 404
            ? 'We could not find a case matching those details.'
            : await responseError(reportResponse, 'We could not open this case. Try again.')
        if (!isCurrent()) return
        throw new Error(message)
      }

      const reportData = (await reportResponse.json()) as LostBagReportDetail
      if (!isCurrent()) return
      let caseNumbers: string[] = []
      let listMessage = ''
      if (listResponse.ok) {
        const list = (await listResponse.json()) as LostBagReportListItem[]
        if (!isCurrent()) return
        caseNumbers = [...new Set(list.map((item) => item.caseNumber))]
      } else {
        listMessage = await responseError(listResponse, 'Other cases could not be loaded.')
        if (!isCurrent()) return
      }

      if (!isCurrent()) return
      dispatchCasePage({ type: 'report-loaded', report: reportData })
      setAccess(normalizedAccess)
      setIsEditingAccess(false)
      setRelatedCases(caseNumbers)
      setCaseListMessage(listMessage)
      void loadCaseSummary(normalizedAccess, requestId)

      try {
        const deliveryResponse = await fetchWithAuth(`${casePath}/delivery-choice?${query}`)
        if (!isCurrent()) return

        if (deliveryResponse.status === 404) {
          dispatchCasePage({ type: 'delivery-missing' })
          return
        }
        if (!deliveryResponse.ok) {
          const message = await responseError(deliveryResponse, 'Delivery details could not be loaded. Reopen the case to try again.')
          if (!isCurrent()) return
          dispatchCasePage({
            type: 'delivery-failed',
            message,
          })
          return
        }

        const delivery = (await deliveryResponse.json()) as DeliveryChoiceState
        if (!isCurrent()) return
        dispatchCasePage({ type: 'delivery-loaded', delivery })
      } catch (cause) {
        if (!isCurrent()) return
        dispatchCasePage({
          type: 'delivery-failed',
          message: cause instanceof Error ? cause.message : 'Delivery details could not be loaded. Reopen the case to try again.',
        })
      }
    } catch (cause) {
      if (!isCurrent()) return
      setError(cause instanceof Error ? cause.message : 'We could not open this case. Try again.')
      dispatchCasePage({ type: 'reset' })
      setAccess(null)
      setIsEditingAccess(true)
    } finally {
      if (isCurrent()) setIsLookingUp(false)
    }
  }

  async function loadCaseSummary(currentAccess: CaseAccess, caseRequestId: number): Promise<void> {
    const summaryRequestId = ++caseSummaryRequest.current
    const isCurrent = () =>
      isCurrentCaseRequest(caseRequestId, caseRequestGeneration.current) &&
      isCurrentCaseRequest(summaryRequestId, caseSummaryRequest.current)
    if (!isCurrent()) return
    const query = accessQuery(currentAccess)
    const path = `/api/customer/lost-reports/${encodeURIComponent(currentAccess.caseNumber)}/summary?${query}`
    setCaseSummaryLoading(true)
    setCaseSummaryError('')

    try {
      const response = await fetchWithAuth(path)
      if (!isCurrent()) return
      if (!response.ok) {
        const message = await responseError(response, 'Recovery timeline details could not be loaded.')
        if (!isCurrent()) return
        setCaseSummary(null)
        setCaseSummaryError(message)
        return
      }

      const summary = (await response.json()) as PassengerCaseSummary
      if (!isCurrent()) return
      setCaseSummary(summary)
    } catch (cause) {
      if (!isCurrent()) return
      setCaseSummary(null)
      setCaseSummaryError(cause instanceof Error ? cause.message : 'Recovery timeline details could not be loaded.')
    } finally {
      if (isCurrent()) setCaseSummaryLoading(false)
    }
  }

  useEffect(() => {
    const caseAccess = location.state.passengerCaseAccess
    if (!caseAccess || openedFromReport.current) return
    openedFromReport.current = true
    void loadCase(caseAccess)
    // This history state is a one-time handoff from the successful report form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state.passengerCaseAccess])

  function openRelatedCase(nextCaseNumber: string) {
    if (!access) return
    void loadCase({ ...access, caseNumber: nextCaseNumber })
  }

  function renderLookupForm(surface: 'desktop' | 'mobile') {
    return (
      <form
        aria-label={surface === 'desktop' ? 'Open a baggage case' : 'Change baggage case'}
        className="passenger-case-access__form"
        onSubmit={(event) => void handleLookup(event)}
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
          />
        </label>
        <button type="submit" disabled={isLookingUp}>
          {isLookingUp ? 'Opening…' : 'Open case'}
        </button>
      </form>
    )
  }

  async function saveChoice(choice: PassengerDeliveryChoice): Promise<void> {
    if (!access) throw new Error('Case access is no longer available. Reopen the case and try again.')

    const currentAccess = access
    const requestId = caseRequestGeneration.current
    const isCurrent = () => isCurrentCaseRequest(requestId, caseRequestGeneration.current)
    setIsSaving(true)
    setError('')
    setSaveNotice('')
    try {
      const response = await fetchWithAuth(
        `/api/customer/lost-reports/${encodeURIComponent(currentAccess.caseNumber)}/delivery-choice?${accessQuery(currentAccess)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(choice),
        },
      )
      if (!isCurrent()) return
      if (!response.ok) {
        if (response.status === 409) await refreshCaseState(currentAccess, requestId)
        const message = await responseError(response, 'We could not save your delivery choice. Try again.')
        if (!isCurrent()) return
        throw new Error(message)
      }

      const result = (await response.json()) as DeliveryChoiceUpdate
      if (!isCurrent()) return
      dispatchCasePage({
        type: 'delivery-loaded',
        delivery: {
          deliveryType: result.deliveryType,
          address: result.address,
          pickupAirport: result.pickupAirport,
          status: result.status,
        },
      })
      void loadCaseSummary(currentAccess, requestId)
      setSaveNotice('Your delivery choice was saved.')
    } catch (cause) {
      if (!isCurrent()) return
      const message = cause instanceof Error ? cause.message : 'We could not save your delivery choice. Try again.'
      setError(message)
      throw cause
    } finally {
      if (isCurrent()) setIsSaving(false)
    }
  }

  async function refreshCaseState(currentAccess: CaseAccess, requestId: number): Promise<void> {
    const isCurrent = () => isCurrentCaseRequest(requestId, caseRequestGeneration.current)
    const query = accessQuery(currentAccess)
    const casePath = `/api/customer/lost-reports/${encodeURIComponent(currentAccess.caseNumber)}`
    const [reportResult, deliveryResult] = await Promise.allSettled([
      fetchWithAuth(`${casePath}?${query}`),
      fetchWithAuth(`${casePath}/delivery-choice?${query}`),
    ])
    if (!isCurrent()) return
    void loadCaseSummary(currentAccess, requestId)

    if (reportResult.status === 'fulfilled' && reportResult.value.ok) {
      const refreshedReport = (await reportResult.value.json().catch(() => null)) as LostBagReportDetail | null
      if (!isCurrent()) return
      if (refreshedReport) dispatchCasePage({ type: 'report-loaded', report: refreshedReport })
    }

    if (!isCurrent()) return
    if (deliveryResult.status === 'rejected') {
      dispatchCasePage({
        type: 'delivery-failed',
        message:
          deliveryResult.reason instanceof Error
            ? deliveryResult.reason.message
            : 'Delivery details could not be loaded. Reopen the case to try again.',
      })
      return
    }

    const deliveryResponse = deliveryResult.value
    try {
      if (deliveryResponse.status === 404) {
        if (!isCurrent()) return
        dispatchCasePage({ type: 'delivery-missing' })
      } else if (deliveryResponse.ok) {
        const delivery = (await deliveryResponse.json()) as DeliveryChoiceState
        if (!isCurrent()) return
        dispatchCasePage({ type: 'delivery-loaded', delivery })
      } else {
        const message = await responseError(deliveryResponse, 'Delivery details could not be loaded. Reopen the case to try again.')
        if (!isCurrent()) return
        dispatchCasePage({
          type: 'delivery-failed',
          message,
        })
      }
    } catch (cause) {
      if (!isCurrent()) return
      dispatchCasePage({
        type: 'delivery-failed',
        message: cause instanceof Error ? cause.message : 'Delivery details could not be loaded. Reopen the case to try again.',
      })
    }
  }

  const reportEligible = report ? RECOVERY_REPORT_STATUSES.includes(report.status) : false
  const deliveryEditable = delivery ? EDITABLE_DELIVERY_STATUSES.includes(delivery.status) : false
  const deliveryLocked = !deliveryEditable || report?.status === 'delivering'

  return (
    <main className="passenger-case-page">
      <header className="passenger-case-page__intro">
        <h1>My bag case</h1>
        <p>Enter your case number with your booking reference and surname. A case number alone does not open a case.</p>
      </header>

      <section className="passenger-case-access" aria-label="Open a baggage case">
        <div className="passenger-case-access__desktop">
          {renderLookupForm('desktop')}
          <TryCaseChips cases={relatedCases} currentCase={report?.caseNumber ?? ''} onOpen={openRelatedCase} />
        </div>
        <div className="passenger-case-access__mobile">
          {report && !isEditingAccess ? (
            <>
              <div className="passenger-case-access__viewing">
                <div>
                  <span>Viewing case</span>
                  <strong>
                    {report.caseNumber} · {access?.surname}
                  </strong>
                </div>
                <button type="button" onClick={() => setIsEditingAccess(true)}>
                  Change
                </button>
              </div>
              <TryCaseChips cases={relatedCases} currentCase={report.caseNumber} onOpen={openRelatedCase} />
            </>
          ) : (
            <>
              {renderLookupForm('mobile')}
              <TryCaseChips cases={relatedCases} currentCase={report?.caseNumber ?? ''} onOpen={openRelatedCase} />
            </>
          )}
        </div>
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
        {caseListMessage && (
          <p className="passenger-case-page__loading" role="status">
            {caseListMessage}
          </p>
        )}
      </section>

      {report && !isEditingAccess && (
        <div className="passenger-case-layout">
          <section className="passenger-case-card" aria-labelledby="passenger-case-title">
            <header className="passenger-case-card__heading">
              <h2 id="passenger-case-title">{report.caseNumber}</h2>
              <span className="passenger-case-card__status">{caseStatusLabel(report, delivery)}</span>
            </header>

            <ol className="passenger-case-progress" aria-label="Baggage recovery progress">
              {PROGRESS_STEPS.map((step, index) => {
                const activeStep = progressStep(report, delivery)
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
              {caseSummary && (
                <>
                  <dt>Passenger</dt>
                  <dd>{`${caseSummary.passenger.firstName} ${caseSummary.passenger.lastName}`}</dd>
                  <dt>Flight</dt>
                  <dd>
                    {caseSummary.flight.flightNumber} · {caseSummary.flight.origin} to {caseSummary.flight.destination} ·{' '}
                    {formatServiceDate(caseSummary.flight.serviceDate)}
                  </dd>
                </>
              )}
              <dt>Bag</dt>
              <dd>{[report.colour, report.bagType, report.brand].filter(Boolean).join(' · ')}</dd>
              {report.tagNumber && (
                <>
                  <dt>Baggage tag</dt>
                  <dd>{report.tagNumber}</dd>
                </>
              )}
              {report.description && (
                <>
                  <dt>Description</dt>
                  <dd>{report.description}</dd>
                </>
              )}
              {delivery && (
                <>
                  <dt>Delivery</dt>
                  <dd>
                    <span className="passenger-case-card__delivery-status">{deliveryStatusLabel(delivery.status)}</span>
                  </dd>
                </>
              )}
              {delivery && deliveryDestination(delivery) && (
                <>
                  <dt>Sending to</dt>
                  <dd>{deliveryDestination(delivery)}</dd>
                </>
              )}
            </dl>

            <h3>Timeline</h3>
            <ol className="passenger-case-timeline">
              {caseSummary?.timeline.map((event, index) => (
                <li key={`${event.type}-${event.occurredAt}-${index}`}>
                  <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                  <span>{timelineEventLabel(event)}</span>
                </li>
              ))}
            </ol>
            {caseSummaryLoading && (
              <p className="passenger-case-page__loading" role="status">
                Loading recovery timeline…
              </p>
            )}
            {caseSummaryError && (
              <p className="passenger-case-page__loading" role="status">
                Recovery timeline unavailable. {caseSummaryError}
              </p>
            )}
            {caseSummary && caseSummary.timeline.length === 0 && (
              <p className="passenger-case-page__loading" role="status">
                No recovery updates have been recorded yet.
              </p>
            )}
          </section>

          <aside className="passenger-case-delivery">
            {isDeliveryUnavailable ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery choice unavailable</h2>
                <p>This case does not have an associated recovery delivery yet.</p>
              </section>
            ) : deliveryError ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery details unavailable</h2>
                <p>{deliveryError}</p>
              </section>
            ) : !delivery ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery details unavailable</h2>
                <p>Delivery details could not be loaded. Reopen the case to try again.</p>
              </section>
            ) : !reportEligible ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery choice unavailable</h2>
                <p>
                  {report.status === 'cancelled'
                    ? 'This case was cancelled, so its delivery choice can no longer be changed.'
                    : report.status === 'closed'
                      ? 'This case is closed, so its delivery choice can no longer be changed.'
                      : 'A delivery choice is available after staff confirms a found bag for this case.'}
                </p>
              </section>
            ) : (
              <DeliveryChoiceForm
                key={passengerDeliveryFormKey(report.caseNumber, deliveryFormRevision)}
                locked={deliveryLocked}
                initialChoice={toInitialChoice(delivery)}
                onSaveChoice={saveChoice}
              />
            )}
            {saveNotice && (
              <p className="passenger-case-page__success" role="status">
                {saveNotice}
              </p>
            )}
          </aside>
        </div>
      )}
      {isSaving && (
        <span className="passenger-case-page__sr-only" role="status">
          Saving delivery choice…
        </span>
      )}
    </main>
  )
}
