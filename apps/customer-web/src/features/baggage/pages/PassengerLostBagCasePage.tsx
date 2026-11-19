import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import { DeliveryChoiceForm, type PassengerDeliveryChoice } from '../components/DeliveryChoiceForm'
import { createPassengerCasePageState, isCurrentCaseRequest, passengerCasePageReducer, passengerDeliveryFormKey } from './case-page-state'
import { caseLookupMatchesOpenedCase, caseRecoveryDetailsMatchCase } from './case-page-recovery'
import {
  CANCELLATION_UNAVAILABLE_MESSAGE,
  canReportBagFoundByPassenger,
  caseProgressPresentation,
  caseStatusLabel,
  deliveryUnavailableMessage,
  shouldShowCancellationUnavailable,
  shouldShowNoOpenCase,
} from './case-page-presentation'
import { canUseOwnerActions, resolveViewerOwnership } from './case-ownership'
import { timelineEventLabel, type PassengerCaseTimelineEvent } from './passenger-case-summary-view'
import {
  ACCOUNT_CASES_PAGE_SIZE,
  accountCaseListReducer,
  createAccountCaseListState,
  hasAccountCaseManagementCapability,
  type AccountCaseListItem,
  visibleAccountCaseSuggestions,
} from './account-case-list'
import { readBaggageApiError } from '../api-error'
import './PassengerLostBagCasePage.css'

interface CaseAccess {
  caseNumber: string
  bookingReference: string
  surname: string
}

interface LostBagReportDetail {
  caseNumber: string
  /** The bag owner's booking passenger; compared with the viewer's own to decide which controls to show. */
  bookingPassengerId?: string
  /** The server's answer: the viewer owns the bag, or is the signed-in customer who filed the case for them. */
  viewerCanManage?: boolean
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
  caseNumber: string
  status: string
  reportedAt: string
  lostAt: string | null
  closedAt: string | null
  passenger: { firstName: string; lastName: string }
  flight: { flightNumber: string; serviceDate: string; origin: string; destination: string }
  bag: { type: string; colour: string; brand: string | null; tagNumber: string | null; description: string | null }
  delivery: DeliveryChoiceState | null
  timeline: PassengerCaseTimelineEvent[]
}

interface AccountCaseDetail {
  summary: PassengerCaseSummary
  isBagOwner: boolean
  canManage: boolean
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

const EDITABLE_DELIVERY_STATUSES: DeliveryStatus[] = ['waiting_choice', 'preparing']
const RECOVERY_REPORT_STATUSES = ['matched', 'delivering', 'lost']
const CASE_NUMBER_PATTERN = /^LB-\d{4}-\d{6}$/i

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
  const body: unknown = await response.json().catch(() => null)

  if (response.status === 401) return 'Your sign-in has expired. Sign in again, then reopen this case.'
  if (response.status === 403) return 'This customer account is not authorized to open this case.'
  return readBaggageApiError(body).message ?? fallback
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatServiceDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
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

function deliveryDestination(delivery: DeliveryChoiceState): string | null {
  if (!delivery.deliveryType) return null
  if (delivery.deliveryType === 'airport_pickup') {
    return delivery.pickupAirport ? `${DELIVERY_TYPE_LABELS.airport_pickup}: ${delivery.pickupAirport}` : null
  }

  return delivery.address ? `${DELIVERY_TYPE_LABELS[delivery.deliveryType]}: ${delivery.address}` : null
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
  const accountCaseRequest = useRef(0)
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
  const [accountCaseList, dispatchAccountCaseList] = useReducer(accountCaseListReducer, undefined, createAccountCaseListState)
  const [accountDetailReadOnly, setAccountDetailReadOnly] = useState(false)
  const [accountCaseCanManage, setAccountCaseCanManage] = useState<boolean | null>(null)
  const [caseSummaryError, setCaseSummaryError] = useState('')
  const [caseSummaryLoading, setCaseSummaryLoading] = useState(false)
  const [visibleAccountCaseCount, setVisibleAccountCaseCount] = useState(ACCOUNT_CASES_PAGE_SIZE)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isConfirmingSelfFound, setIsConfirmingSelfFound] = useState(false)
  const [isEditingAccess, setIsEditingAccess] = useState(true)
  const [saveNotice, setSaveNotice] = useState('')
  const [error, setError] = useState('')
  // true: bag owner, or the customer who filed the case for them; false: another traveller on the booking (read-only
  // view); null: not known yet.
  const [viewerIsBagOwner, setViewerIsBagOwner] = useState<boolean | null>(null)
  const ownerActionsAllowed = access !== null && canUseOwnerActions(viewerIsBagOwner)
  const deliveryActionsAllowed = accountDetailReadOnly ? accountCaseCanManage === true : ownerActionsAllowed

  async function loadOwnership(
    currentAccess: CaseAccess,
    reportBookingPassengerId: string | undefined,
    caseRequestId: number,
    viewerCanManage: boolean,
  ) {
    const isCurrent = () => isCurrentCaseRequest(caseRequestId, caseRequestGeneration.current)
    // The customer who filed this case for another traveller manages it like the owner. The backend checks again.
    if (viewerCanManage) {
      setViewerIsBagOwner(true)
      return
    }
    const result = await resolveViewerOwnership(
      () =>
        fetchWithAuth(
          `/api/customer/lost-report-travellers?bookingReference=${encodeURIComponent(currentAccess.bookingReference)}&surname=${encodeURIComponent(currentAccess.surname)}`,
        ),
      reportBookingPassengerId,
      isCurrent,
    )
    // Checked again here, after the last await, before touching state: a stale case's result is dropped.
    if (result.stale || !isCurrent()) return
    setViewerIsBagOwner(result.ownership)
  }

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaveNotice('')

    const requestAccess = {
      caseNumber: caseNumber.trim().toUpperCase(),
      bookingReference: bookingReference.trim().toUpperCase(),
      surname: surname.trim(),
    }

    if (report && access && !caseLookupMatchesOpenedCase(access, requestAccess)) clearOpenedCase()

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
    setIsCancelling(false)
    setIsConfirmingSelfFound(false)
    setError('')
    dispatchCasePage({ type: 'reset' })
    setCaseSummary(null)
    setCaseSummaryError('')
    setCaseSummaryLoading(false)
    setAccess(null)
    setViewerIsBagOwner(null)
    setAccountDetailReadOnly(false)
    setAccountCaseCanManage(null)
    setCaseNumber(normalizedAccess.caseNumber)
    dispatchAccountCaseList({
      type: 'selected',
      caseNumber: accountCaseList.cases.some((item) => item.caseNumber === normalizedAccess.caseNumber)
        ? normalizedAccess.caseNumber
        : null,
    })
    setBookingReference(normalizedAccess.bookingReference)
    setSurname(normalizedAccess.surname)
    try {
      const query = accessQuery(normalizedAccess)
      const casePath = `/api/customer/lost-reports/${encodeURIComponent(normalizedAccess.caseNumber)}`
      const reportResponse = await fetchWithAuth(`${casePath}?${query}`)
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
      dispatchCasePage({ type: 'report-loaded', report: reportData })
      setAccess(normalizedAccess)
      setIsEditingAccess(false)
      void loadCaseSummary(normalizedAccess, requestId)
      void loadOwnership(normalizedAccess, reportData.bookingPassengerId, requestId, reportData.viewerCanManage === true)

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

  async function loadAccountCases(): Promise<void> {
    const requestId = ++accountCaseRequest.current
    const isCurrent = () => requestId === accountCaseRequest.current
    dispatchAccountCaseList({ type: 'loading' })

    try {
      const response = await fetchWithAuth('/api/customer/lost-reports/my-cases')
      if (!isCurrent()) return
      if (!response.ok) {
        dispatchAccountCaseList({ type: 'failed', error: await responseError(response, 'Your cases could not be loaded.') })
        return
      }

      const cases = (await response.json()) as AccountCaseListItem[]
      if (!isCurrent()) return
      if (!Array.isArray(cases)) throw new Error('The case list response was invalid.')
      dispatchAccountCaseList({ type: 'loaded', cases })
    } catch (cause) {
      if (!isCurrent()) return
      dispatchAccountCaseList({ type: 'failed', error: cause instanceof Error ? cause.message : 'Your cases could not be loaded.' })
    }
  }

  async function loadAccountCase(caseNumberToOpen: string): Promise<void> {
    const requestId = ++caseRequestGeneration.current
    caseSummaryRequest.current += 1
    const isCurrent = () => isCurrentCaseRequest(requestId, caseRequestGeneration.current)
    setIsLookingUp(true)
    setError('')
    setSaveNotice('')
    setIsSaving(false)
    setIsCancelling(false)
    setIsConfirmingSelfFound(false)
    setAccess(null)
    setAccountDetailReadOnly(true)
    setAccountCaseCanManage(null)
    setViewerIsBagOwner(null)
    setCaseSummary(null)
    setCaseSummaryError('')
    setCaseSummaryLoading(false)
    dispatchCasePage({ type: 'reset' })

    try {
      const response = await fetchWithAuth(`/api/customer/lost-reports/my-cases/${encodeURIComponent(caseNumberToOpen)}`)
      if (!isCurrent()) return
      if (!response.ok) {
        throw new Error(await responseError(response, 'We could not open this case. Try again.'))
      }

      const detail = (await response.json()) as AccountCaseDetail
      if (!isCurrent()) return
      const summary = detail.summary
      const reportData: LostBagReportDetail = {
        caseNumber: summary.caseNumber,
        bagType: summary.bag.type,
        colour: summary.bag.colour,
        brand: summary.bag.brand,
        tagNumber: summary.bag.tagNumber,
        description: summary.bag.description,
        status: summary.status,
        reportedAt: summary.reportedAt,
        lostAt: summary.lostAt,
        closedAt: summary.closedAt,
      }

      setCaseNumber(summary.caseNumber)
      setCaseSummary(summary)
      setViewerIsBagOwner(detail.isBagOwner)
      setAccountCaseCanManage(hasAccountCaseManagementCapability(detail.canManage))
      setIsEditingAccess(false)
      dispatchCasePage({ type: 'report-loaded', report: reportData })
      if (summary.delivery) dispatchCasePage({ type: 'delivery-loaded', delivery: summary.delivery })
      else dispatchCasePage({ type: 'delivery-missing' })
    } catch (cause) {
      if (!isCurrent()) return
      setError(cause instanceof Error ? cause.message : 'We could not open this case. Try again.')
      setIsEditingAccess(true)
    } finally {
      if (isCurrent()) setIsLookingUp(false)
    }
  }

  async function refreshAccountCaseState(caseNumberToRefresh: string, requestId: number): Promise<void> {
    const isCurrent = () => isCurrentCaseRequest(requestId, caseRequestGeneration.current)
    const response = await fetchWithAuth(`/api/customer/lost-reports/my-cases/${encodeURIComponent(caseNumberToRefresh)}`)
    if (!isCurrent() || !response.ok) return

    const detail = (await response.json()) as AccountCaseDetail
    if (!isCurrent()) return
    const summary = detail.summary
    setCaseSummary(summary)
    setViewerIsBagOwner(detail.isBagOwner)
    setAccountCaseCanManage(hasAccountCaseManagementCapability(detail.canManage))
    dispatchCasePage({
      type: 'report-loaded',
      report: {
        caseNumber: summary.caseNumber,
        bagType: summary.bag.type,
        colour: summary.bag.colour,
        brand: summary.bag.brand,
        tagNumber: summary.bag.tagNumber,
        description: summary.bag.description,
        status: summary.status,
        reportedAt: summary.reportedAt,
        lostAt: summary.lostAt,
        closedAt: summary.closedAt,
      },
    })
    if (summary.delivery) dispatchCasePage({ type: 'delivery-loaded', delivery: summary.delivery })
    else dispatchCasePage({ type: 'delivery-missing' })
  }

  function openAccountCase(nextCaseNumber: string): void {
    if (!accountCaseList.cases.some((item) => item.caseNumber === nextCaseNumber)) return
    dispatchAccountCaseList({ type: 'selected', caseNumber: nextCaseNumber })
    void loadAccountCase(nextCaseNumber)
  }

  useEffect(() => {
    void loadAccountCases()
    return () => {
      accountCaseRequest.current += 1
    }
    // fetchWithAuth is a render-scoped wrapper around stable auth refs; load only when this route mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const caseAccess = location.state.passengerCaseAccess
    if (!caseAccess || openedFromReport.current) return
    openedFromReport.current = true
    void loadCase(caseAccess)
    // This history state is a one-time handoff from the successful report form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state.passengerCaseAccess])

  function updateRecoveryDetails(field: 'bookingReference' | 'surname', value: string): void {
    const nextBookingReference = field === 'bookingReference' ? value : bookingReference
    const nextSurname = field === 'surname' ? value : surname
    if (access && !caseRecoveryDetailsMatchCase(access, nextBookingReference, nextSurname)) {
      clearOpenedCase()
    }

    if (field === 'bookingReference') setBookingReference(value.toUpperCase())
    else setSurname(value)
  }

  function clearOpenedCase(): void {
    caseRequestGeneration.current += 1
    caseSummaryRequest.current += 1
    dispatchCasePage({ type: 'reset' })
    setCaseSummary(null)
    setCaseSummaryError('')
    setCaseSummaryLoading(false)
    setAccess(null)
    setViewerIsBagOwner(null)
    setAccountDetailReadOnly(false)
    setAccountCaseCanManage(null)
    dispatchAccountCaseList({ type: 'selected', caseNumber: null })
    setIsEditingAccess(true)
    setCaseNumber('')
    setVisibleAccountCaseCount(ACCOUNT_CASES_PAGE_SIZE)
    setIsLookingUp(false)
    setIsSaving(false)
    setIsCancelling(false)
    setIsConfirmingSelfFound(false)
    setError('')
    setSaveNotice('')
  }

  function renderLookupForm() {
    return (
      <form aria-label="Open a baggage case" className="passenger-case-access__form" onSubmit={(event) => void handleLookup(event)}>
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
            onChange={(event) => updateRecoveryDetails('bookingReference', event.currentTarget.value)}
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
            onChange={(event) => updateRecoveryDetails('surname', event.currentTarget.value)}
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
    const accountCaseNumber = accountDetailReadOnly && accountCaseCanManage === true ? report?.caseNumber : undefined
    const caseNumberToSave = access?.caseNumber ?? accountCaseNumber
    if (!caseNumberToSave) throw new Error('Case access is no longer available. Reopen the case and try again.')
    if (access && !ownerActionsAllowed) throw new Error('Only an authorized case manager can choose the delivery.')
    if (!access && !accountCaseNumber) throw new Error('Only an authorized case manager can choose the delivery.')

    const currentAccess = access
    const accountSelectedCaseNumber = currentAccess ? null : (accountCaseNumber ?? null)
    const requestId = caseRequestGeneration.current
    const isCurrent = () => isCurrentCaseRequest(requestId, caseRequestGeneration.current)
    setIsSaving(true)
    setError('')
    setSaveNotice('')
    try {
      const response = await fetchWithAuth(
        currentAccess
          ? `/api/customer/lost-reports/${encodeURIComponent(currentAccess.caseNumber)}/delivery-choice?${accessQuery(currentAccess)}`
          : `/api/customer/lost-reports/my-cases/${encodeURIComponent(caseNumberToSave)}/delivery-choice`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(choice),
        },
      )
      if (!isCurrent()) return
      if (!response.ok) {
        if (response.status === 409) {
          if (currentAccess) await refreshCaseState(currentAccess, requestId)
          else if (accountSelectedCaseNumber) await refreshAccountCaseState(accountSelectedCaseNumber, requestId)
        }
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
      if (currentAccess) void loadCaseSummary(currentAccess, requestId)
      else if (accountSelectedCaseNumber) void refreshAccountCaseState(accountSelectedCaseNumber, requestId)
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

  async function reportBagFoundByPassenger(): Promise<void> {
    if (!report || !access || !canReportBagFoundByPassenger(report.status, delivery?.status ?? null) || !ownerActionsAllowed) return

    const currentAccess = access
    const requestId = caseRequestGeneration.current
    const isCurrent = () => isCurrentCaseRequest(requestId, caseRequestGeneration.current)
    setIsCancelling(true)
    setError('')
    setSaveNotice('')

    try {
      const response = await fetchWithAuth(
        `/api/customer/lost-reports/${encodeURIComponent(currentAccess.caseNumber)}/cancel?${accessQuery(currentAccess)}`,
        { method: 'PATCH' },
      )
      if (!isCurrent()) return
      if (!response.ok) {
        throw new Error(await responseError(response, 'This report can no longer be cancelled.'))
      }

      const cancelledReport = (await response.json()) as LostBagReportDetail
      if (!isCurrent()) return
      dispatchCasePage({ type: 'report-loaded', report: cancelledReport })
      setIsConfirmingSelfFound(false)
      setSaveNotice('This report was cancelled because the bag was found.')
      void loadCaseSummary(currentAccess, requestId)
    } catch (cause) {
      if (!isCurrent()) return
      setError(cause instanceof Error ? cause.message : 'This report could not be cancelled. Try again.')
    } finally {
      if (isCurrent()) setIsCancelling(false)
    }
  }

  const reportEligible = report ? RECOVERY_REPORT_STATUSES.includes(report.status) : false
  const deliveryEditable = delivery ? EDITABLE_DELIVERY_STATUSES.includes(delivery.status) : false
  const deliveryLocked = !deliveryEditable || report?.status === 'delivering'
  const progress = report ? caseProgressPresentation(report.status, delivery?.status ?? null) : { steps: [], activeStep: 0 }
  const displayedCaseStatus = report ? caseStatusLabel(report.status, delivery?.status ?? null) : ''
  const isTimedOutCase = progress.steps[0] === 'Reported'
  const visibleCases = visibleAccountCaseSuggestions(accountCaseList.cases, visibleAccountCaseCount)

  return (
    <main className="passenger-case-page">
      <header className="passenger-case-page__intro">
        <h1>My bag cases</h1>
        <p>Enter your case number with your booking reference and surname. A case number alone does not open a case.</p>
      </header>

      <section className="passenger-case-access" aria-label="Open a baggage case">
        {renderLookupForm()}
        <div className="passenger-case-access__suggestions" role="group" aria-label="Cases linked to your account">
          <span>Try:</span>
          {accountCaseList.status === 'ready' &&
            visibleCases.map((item) => (
              <button
                aria-pressed={accountCaseList.selectedCaseNumber === item.caseNumber}
                disabled={isLookingUp}
                key={item.caseNumber}
                type="button"
                onClick={() => openAccountCase(item.caseNumber)}
              >
                {item.caseNumber}
              </button>
            ))}
          {accountCaseList.status === 'ready' && accountCaseList.cases.length > visibleCases.length && (
            <button
              className="passenger-case-access__more-cases"
              type="button"
              onClick={() => setVisibleAccountCaseCount((count) => count + ACCOUNT_CASES_PAGE_SIZE)}
            >
              Show more cases
            </button>
          )}
          {accountCaseList.status === 'ready' && visibleAccountCaseCount > ACCOUNT_CASES_PAGE_SIZE && (
            <button
              className="passenger-case-access__more-cases"
              type="button"
              onClick={() => setVisibleAccountCaseCount(ACCOUNT_CASES_PAGE_SIZE)}
            >
              Show fewer
            </button>
          )}
        </div>
        {accountCaseList.status === 'loading' && (
          <p className="passenger-case-access__recovery-message" role="status">
            Loading your cases…
          </p>
        )}
        {accountCaseList.status === 'error' && (
          <div>
            <p className="passenger-case-page__error" role="alert">
              {accountCaseList.error}
            </p>
            <button className="passenger-account-cases__retry" type="button" onClick={() => void loadAccountCases()}>
              Try again
            </button>
          </div>
        )}
        {accountCaseList.status === 'ready' && accountCaseList.cases.length === 0 && (
          <p className="passenger-account-cases__empty">No baggage cases are linked to your account yet.</p>
        )}
        {isLookingUp && (
          <p className="passenger-case-page__loading" role="status">
            Loading case details…
          </p>
        )}
        {error && (
          <p className="passenger-case-page__error" role="alert">
            {error}
          </p>
        )}
      </section>

      {accountCaseList.status === 'ready' &&
        accountCaseList.cases.length === 0 &&
        shouldShowNoOpenCase(Boolean(report), isLookingUp, Boolean(error)) && (
          <section className="passenger-case-empty" aria-labelledby="passenger-case-empty-title">
            <h2 id="passenger-case-empty-title">No case open yet</h2>
            <p>Enter your case details above to follow a report. If you have not reported a bag yet, start here.</p>
            <Link className="passenger-case-empty__link" to="/report-lost-bag">
              Report a lost bag
            </Link>
          </section>
        )}

      {report && !isEditingAccess && (
        <div className="passenger-case-layout">
          <section className="passenger-case-card" aria-labelledby="passenger-case-title">
            <header className="passenger-case-card__heading">
              <h2 id="passenger-case-title">{report.caseNumber}</h2>
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

            {isTimedOutCase && (
              <p className="passenger-case-timeout" role="status">
                Your bag was not found within 21 days.
                {report.lostAt && (
                  <>
                    {' '}
                    Marked lost <time dateTime={report.lostAt}>{formatDate(report.lostAt)}</time>.
                  </>
                )}
              </p>
            )}

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

            {canReportBagFoundByPassenger(report.status, delivery?.status ?? null) && access && ownerActionsAllowed && (
              <div className="passenger-case-self-found">
                {!isConfirmingSelfFound ? (
                  <button
                    className="passenger-case-self-found__trigger"
                    type="button"
                    disabled={isCancelling}
                    onClick={() => setIsConfirmingSelfFound(true)}
                  >
                    The bag has been found
                  </button>
                ) : (
                  <div className="passenger-case-self-found__confirmation" role="group" aria-label="Confirm found bag cancellation">
                    <p>Cancel this report because the bag was found?</p>
                    <div>
                      <button type="button" disabled={isCancelling} onClick={() => void reportBagFoundByPassenger()}>
                        {isCancelling ? 'Cancelling…' : 'Yes, cancel report'}
                      </button>
                      <button type="button" disabled={isCancelling} onClick={() => setIsConfirmingSelfFound(false)}>
                        Keep searching
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {shouldShowCancellationUnavailable(report.status, delivery?.status ?? null) && access && ownerActionsAllowed && (
              <p className="passenger-case-cancel-unavailable" role="status">
                {CANCELLATION_UNAVAILABLE_MESSAGE}
              </p>
            )}
          </section>

          <aside className="passenger-case-delivery">
            {accountDetailReadOnly && accountCaseCanManage !== true ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery</h2>
                {delivery ? (
                  <>
                    <p>{deliveryStatusLabel(delivery.status)}</p>
                    {deliveryDestination(delivery) && <p>{deliveryDestination(delivery)}</p>}
                  </>
                ) : (
                  <p>No delivery choice has been recorded for this case.</p>
                )}
                <p>Only the bag owner or a verified reporter can choose or change delivery for this case.</p>
              </section>
            ) : !accountDetailReadOnly && viewerIsBagOwner === false ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery</h2>
                <p>
                  Only the bag owner or a verified reporter can choose or change delivery for this case. The backend checks this again when
                  saving.
                </p>
              </section>
            ) : isDeliveryUnavailable ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery</h2>
                <p>{deliveryUnavailableMessage(report.status)}</p>
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
            ) : !deliveryActionsAllowed ? (
              <section className="passenger-case-info" role="status">
                <h2>Delivery</h2>
                <p>Checking that this is your bag before showing delivery options. If they do not appear, reopen the case to try again.</p>
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
