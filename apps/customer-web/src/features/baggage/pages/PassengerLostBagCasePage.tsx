import { useState, type FormEvent } from 'react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { DeliveryChoiceForm, type PassengerDeliveryChoice } from '../components/DeliveryChoiceForm'
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
  const [caseNumber, setCaseNumber] = useState('')
  const [bookingReference, setBookingReference] = useState('')
  const [surname, setSurname] = useState('')
  const [access, setAccess] = useState<CaseAccess | null>(null)
  const [report, setReport] = useState<LostBagReportDetail | null>(null)
  const [delivery, setDelivery] = useState<DeliveryChoiceState | null>(null)
  const [relatedCases, setRelatedCases] = useState<string[]>([])
  const [caseListMessage, setCaseListMessage] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingAccess, setIsEditingAccess] = useState(true)
  const [isDeliveryUnavailable, setIsDeliveryUnavailable] = useState(false)
  const [deliveryFormRevision, setDeliveryFormRevision] = useState(0)
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
    const normalizedAccess = {
      ...requestAccess,
      caseNumber: requestAccess.caseNumber.trim().toUpperCase(),
      bookingReference: requestAccess.bookingReference.trim().toUpperCase(),
      surname: requestAccess.surname.trim(),
    }

    setIsLookingUp(true)
    setError('')
    setReport(null)
    setDelivery(null)
    setAccess(null)
    setIsDeliveryUnavailable(false)
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

      if (!reportResponse.ok) {
        const message =
          reportResponse.status === 404
            ? 'We could not find a case matching those details.'
            : await responseError(reportResponse, 'We could not open this case. Try again.')
        throw new Error(message)
      }

      const reportData = (await reportResponse.json()) as LostBagReportDetail
      let caseNumbers: string[] = []
      let listMessage = ''
      if (listResponse.ok) {
        const list = (await listResponse.json()) as LostBagReportListItem[]
        caseNumbers = [...new Set(list.map((item) => item.caseNumber))]
      } else {
        listMessage = await responseError(listResponse, 'Other cases could not be loaded.')
      }

      const deliveryResponse = await fetchWithAuth(`${casePath}/delivery-choice?${query}`)

      setReport(reportData)
      setAccess(normalizedAccess)
      setIsEditingAccess(false)
      setRelatedCases(caseNumbers)
      setCaseListMessage(listMessage)

      if (deliveryResponse.status === 404) {
        setIsDeliveryUnavailable(true)
        return
      }
      if (!deliveryResponse.ok) {
        throw new Error(await responseError(deliveryResponse, 'We could not load the delivery details. Try again.'))
      }

      setDelivery((await deliveryResponse.json()) as DeliveryChoiceState)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not open this case. Try again.')
      setReport(null)
      setDelivery(null)
      setAccess(null)
      setIsEditingAccess(true)
    } finally {
      setIsLookingUp(false)
    }
  }

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

    setIsSaving(true)
    setError('')
    setSaveNotice('')
    try {
      const response = await fetchWithAuth(
        `/api/customer/lost-reports/${encodeURIComponent(access.caseNumber)}/delivery-choice?${accessQuery(access)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(choice),
        },
      )
      if (!response.ok) {
        if (response.status === 409) await refreshCaseState(access)
        throw new Error(await responseError(response, 'We could not save your delivery choice. Try again.'))
      }

      const result = (await response.json()) as DeliveryChoiceUpdate
      setDelivery({
        deliveryType: result.deliveryType,
        address: result.address,
        pickupAirport: result.pickupAirport,
        status: result.status,
      })
      setDeliveryFormRevision((revision) => revision + 1)
      setSaveNotice('Your delivery choice was saved.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'We could not save your delivery choice. Try again.'
      setError(message)
      throw cause
    } finally {
      setIsSaving(false)
    }
  }

  async function refreshCaseState(currentAccess: CaseAccess): Promise<void> {
    const query = accessQuery(currentAccess)
    const casePath = `/api/customer/lost-reports/${encodeURIComponent(currentAccess.caseNumber)}`
    const [reportResponse, deliveryResponse] = await Promise.all([
      fetchWithAuth(`${casePath}?${query}`),
      fetchWithAuth(`${casePath}/delivery-choice?${query}`),
    ])

    if (reportResponse.ok) setReport((await reportResponse.json()) as LostBagReportDetail)
    if (deliveryResponse.status === 404) {
      setDelivery(null)
      setIsDeliveryUnavailable(true)
    } else if (deliveryResponse.ok) {
      setDelivery((await deliveryResponse.json()) as DeliveryChoiceState)
      setIsDeliveryUnavailable(false)
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
              <li>
                <time dateTime={report.reportedAt}>{formatDate(report.reportedAt)}</time>
                <span>Report received</span>
              </li>
              {report.lostAt && (
                <li>
                  <time dateTime={report.lostAt}>{formatDate(report.lostAt)}</time>
                  <span>Case marked lost</span>
                </li>
              )}
              {report.closedAt && (
                <li>
                  <time dateTime={report.closedAt}>{formatDate(report.closedAt)}</time>
                  <span>Case closed</span>
                </li>
              )}
            </ol>
          </section>

          <aside className="passenger-case-delivery">
            {isDeliveryUnavailable ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery choice unavailable</h2>
                <p>This case does not have an associated recovery delivery yet.</p>
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
                key={`${report.caseNumber}-${deliveryFormRevision}`}
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
