import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, inputStyle } from './styles'
import {
  FLIGHT_ISSUES,
  FOOD_ISSUES,
  LOCATIONS,
  STATUS_LABEL,
  optionLabel,
  type CaseStatus,
  type Complaint,
} from './types'
import { ComplaintPage } from './ui'

const TRACKER_STEPS: { status: CaseStatus; label: string }[] = [
  { status: 'with_supervisor', label: 'With supervisor' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'resolved', label: 'Resolved' },
  { status: 'closed', label: 'Closed' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatShortTimestamp(isoStr: string): string {
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime())) return isoStr
  const day = d.getDate()
  const mon = MONTHS[d.getMonth()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${mon} ${hh}:${mm}`
}

function formatDayMonthLabel(dateStr: string | null, fallbackIso: string): string {
  const d = new Date(dateStr ? `${dateStr}T00:00:00` : fallbackIso)
  if (Number.isNaN(d.getTime())) return dateStr ?? 'Mon 12 Oct'
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function formatShortMonthDay(dateStr: string | null, fallbackIso: string): string {
  const d = new Date(dateStr ? `${dateStr}T00:00:00` : fallbackIso)
  if (Number.isNaN(d.getTime())) return dateStr ?? '12 Oct'
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function StatusPill({ status }: { status: CaseStatus }) {
  const palette: Record<CaseStatus, { bg: string; text: string; dot: string }> = {
    with_supervisor: { bg: '#FFF5E0', text: '#855705', dot: '#D97706' },
    assigned: { bg: '#E8F1FF', text: '#1D4ED8', dot: '#2563EB' },
    resolved: { bg: '#E0FAEB', text: '#087338', dot: '#16A34A' },
    closed: { bg: '#F2F5F7', text: '#545E70', dot: '#64748B' },
  }
  const style = palette[status] ?? palette.with_supervisor
  return (
    <div
      style={{
        backgroundColor: style.bg,
        borderRadius: '6px',
        padding: '3px 9px 3px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '999px',
          backgroundColor: style.dot,
          display: 'inline-block',
        }}
      />
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: style.text,
          whiteSpace: 'nowrap',
        }}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  )
}

interface TimelineItem {
  id: string
  time: string
  title: string
  subtext?: string
  dotColor: 'green' | 'blue'
}

function buildTimeline(complaint: Complaint, isGuest: boolean, activeBookingRef: string): TimelineItem[] {
  const openedDate = new Date(complaint.openedAt)
  const t0 = formatShortTimestamp(complaint.openedAt)
  const t1Date = new Date(Number.isNaN(openedDate.getTime()) ? Date.now() : openedDate.getTime() + 60_000)
  const t1 = formatShortTimestamp(t1Date.toISOString())

  const items: TimelineItem[] = [
    {
      id: 'step-created',
      time: t0,
      title: isGuest ? `You sent the complaint (booking ${activeBookingRef})` : 'You sent the complaint',
      dotColor: 'green',
    },
    {
      id: 'step-routed',
      time: t0,
      title: 'Sent to the Customer Service supervisor',
      dotColor: 'green',
    },
    {
      id: 'step-email',
      time: t1,
      title: 'Email sent',
      subtext: 'We received your complaint',
      dotColor: 'blue',
    },
  ]

  for (const ev of complaint.events ?? []) {
    if (ev.type === 'created' || ev.type === 'routed_to_supervisor') continue
    const evTime = ev.timeLabel || formatShortTimestamp(ev.occurredAt)
    if (ev.type === 'assigned') {
      items.push({
        id: ev.id,
        time: evTime,
        title: 'Assigned to a Customer Service agent',
        dotColor: 'blue',
      })
    } else if (ev.type === 'status_changed' && ev.toValue === 'resolved') {
      items.push({
        id: ev.id,
        time: evTime,
        title: 'Marked resolved by Customer Service',
        subtext: ev.note || undefined,
        dotColor: 'blue',
      })
    } else if (ev.type === 'compensation_decided') {
      items.push({
        id: ev.id,
        time: evTime,
        title: ev.title || `Compensation approved (${ev.toValue ?? ''})`,
        dotColor: 'blue',
      })
    } else if (ev.type === 'closed') {
      items.push({
        id: ev.id,
        time: evTime,
        title: 'Case closed',
        dotColor: 'blue',
      })
    } else if (ev.type === 'reopened') {
      items.push({
        id: ev.id,
        time: evTime,
        title: 'Case reopened and sent to supervisor',
        dotColor: 'blue',
      })
    }
  }

  return items.map((item, idx) => ({
    ...item,
    dotColor: idx === items.length - 1 ? 'blue' : 'green',
  }))
}

export function CheckCasePage() {
  const navigate = useNavigate()
  const { user } = useAppAuth()
  const { caseNumber, bookingRef: urlBookingRef, surname: urlSurname, guest: urlGuest } = useSearch({
    from: '/_authenticated/complaints/check',
  })
  const api = useComplaintsApi()

  // Determine whether we are in Guest mode (06c / 06d) vs Signed-in Account mode (06)
  const [guestLookupOverride, setGuestLookupOverride] = useState<boolean>(() => {
    return urlGuest === '1'
  })

  const isGuestMode = !user || guestLookupOverride || urlGuest === '1'

  // Inputs for 06c / 06d "Card / Check a case"
  const [caseInput, setCaseInput] = useState(caseNumber ?? '')
  const [bookingRefInput, setBookingRefInput] = useState(urlBookingRef ?? 'P4LM8T')
  const [surnameInput, setSurnameInput] = useState(urlSurname ?? 'Prasert')

  // State for signed-in account's own complaints (06)
  const [cases, setCases] = useState<Complaint[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  // State for the selected / checked complaint detail (right column)
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [caseError, setCaseError] = useState<string | null>(null)

  const fetchList = useEffectEvent(() => api.list())
  const fetchAccountCase = useEffectEvent((n: string) => api.get(n))
  const fetchGuestCase = useEffectEvent((n: string, b?: string, s?: string) => api.getGuest(n, b, s))

  // Only load "Your complaints" when signed in AND not in guest lookup mode
  useEffect(() => {
    if (isGuestMode) {
      setCases(null)
      setListError(null)
      return
    }
    let cancelled = false
    fetchList().then(
      (rows) => {
        if (!cancelled) {
          setCases(rows)
          if (!caseNumber && rows.length > 0) {
            void navigate({
              to: '/complaints/check',
              search: {
                caseNumber: rows[0].caseNumber,
                bookingRef: undefined,
                surname: undefined,
                guest: undefined,
              },
            })
          }
        }
      },
      (e: unknown) => {
        if (!cancelled) setListError(errorMessage(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [isGuestMode])

  // Load the case specified in the URL
  useEffect(() => {
    if (!caseNumber) {
      setComplaint(null)
      setCaseError(null)
      return
    }
    setCaseInput(caseNumber)
    if (urlBookingRef) setBookingRefInput(urlBookingRef)
    if (urlSurname) setSurnameInput(urlSurname)

    let cancelled = false
    const promise = isGuestMode
      ? fetchGuestCase(caseNumber, urlBookingRef, urlSurname)
      : fetchAccountCase(caseNumber)

    promise.then(
      (row) => {
        if (cancelled) return
        setComplaint(row)
        setCaseError(null)
        if (!urlBookingRef && row.bookingRef) {
          setBookingRefInput(row.bookingRef)
        }
        if (!urlSurname && row.passengerName) {
          const last = row.passengerName.trim().split(/\s+/).pop()
          if (last) setSurnameInput(last)
        }
      },
      (e: unknown) => {
        if (cancelled) return
        setComplaint(null)
        setCaseError(errorMessage(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [caseNumber, urlBookingRef, urlSurname, isGuestMode])

  function handleGuestCheckSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedCase = caseInput.trim().toUpperCase()
    const trimmedRef = bookingRefInput.trim().toUpperCase()
    const trimmedSurname = surnameInput.trim()
    if (!trimmedCase) {
      setCaseError('Please enter your case number.')
      return
    }
    if (!trimmedRef || !trimmedSurname) {
      setCaseError('Please enter both your booking reference and surname.')
      return
    }
    setCaseError(null)
    void navigate({
      to: '/complaints/check',
      search: {
        caseNumber: trimmedCase,
        bookingRef: trimmedRef,
        surname: trimmedSurname,
        guest: '1',
      },
    })
  }

  function switchToAccountView() {
    sessionStorage.removeItem('f13_guest_mode')
    if (!user) {
      void navigate({ to: '/login', search: { redirect: '/complaints/check' } })
      return
    }
    setGuestLookupOverride(false)
    void navigate({
      to: '/complaints/check',
      search: {
        caseNumber: undefined,
        bookingRef: undefined,
        surname: undefined,
        guest: undefined,
      },
    })
  }

  function switchToGuestLookupView() {
    sessionStorage.setItem('f13_guest_mode', '1')
    setGuestLookupOverride(true)
    void navigate({
      to: '/complaints/check',
      search: {
        caseNumber: complaint?.caseNumber || caseInput || undefined,
        bookingRef: bookingRefInput || 'P4LM8T',
        surname: surnameInput || 'Prasert',
        guest: '1',
      },
    })
  }

  const allCases = cases ?? []
  const activeBookingRef = complaint?.bookingRef || bookingRefInput || 'P4LM8T'
  const currentStepIdx = complaint
    ? Math.max(
        0,
        TRACKER_STEPS.findIndex((s) => s.status === complaint.status),
      )
    : 0
  const timelineItems = complaint ? buildTimeline(complaint, isGuestMode, activeBookingRef) : []

  const flightFactValue = complaint
    ? complaint.flightRoute
      ? complaint.flightRoute.split('·').slice(0, 2).join('·').trim()
      : complaint.flightNumber || 'FY402 · BKK → CNX'
    : '—'
  const dateFactValue = complaint ? formatDayMonthLabel(complaint.serviceDate, complaint.openedAt) : '—'
  const issueFactValue = complaint
    ? optionLabel(complaint.type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES, complaint.issue) || 'Delay'
    : '—'

  return (
    <ComplaintPage isGuest={isGuestMode} onSignInClick={switchToAccountView}>
      {/* Page Header matching Figma 06 (Signed in) vs 06c / 06d (Passenger without an account) */}
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
        <div
          onClick={() => void navigate({ to: '/complaints' })}
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#2563EB',
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          ← Make a complaint
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '26px',
            fontWeight: 700,
            color: '#0A1424',
            letterSpacing: '-0.02em',
          }}
        >
          {isGuestMode ? 'Check a case' : 'Your complaints'}
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#677287' }}>
          {isGuestMode
            ? 'Without an account, use the case number from your email, your booking reference and your surname.'
            : 'Check the status and history of your cases.'}
        </p>
      </div>

      {/* Two Column Layout matching Figma (Left 392px, gap 24px, Right 784px) */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left Column (392px): Card / Check a case (06c/06d) OR Card / Your complaints (06) */}
        {isGuestMode ? (
          <form
            onSubmit={handleGuestCheckSubmit}
            style={{
              width: '392px',
              flexShrink: 0,
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #DBE2EA',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxSizing: 'border-box',
              textAlign: 'left',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>
              Check a case
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="guest-check-case" style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                Case number
              </label>
              <input
                id="guest-check-case"
                type="text"
                value={caseInput}
                onChange={(e) => setCaseInput(e.target.value.toUpperCase())}
                placeholder="e.g. CS-2026-000124"
                style={{ ...inputStyle, textTransform: 'uppercase' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="guest-check-booking" style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                Booking reference
              </label>
              <input
                id="guest-check-booking"
                type="text"
                value={bookingRefInput}
                onChange={(e) => setBookingRefInput(e.target.value.toUpperCase())}
                placeholder="e.g. P4LM8T"
                style={{ ...inputStyle, textTransform: 'uppercase' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="guest-check-surname" style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                Surname
              </label>
              <input
                id="guest-check-surname"
                type="text"
                value={surnameInput}
                onChange={(e) => setSurnameInput(e.target.value)}
                placeholder="As on your booking"
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              style={{
                alignSelf: 'flex-start',
                backgroundColor: '#102544',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Check
            </button>

            <p style={{ margin: 0, fontSize: '12px', color: '#677287', lineHeight: 1.4 }}>
              You only see a case when the booking reference and surname match it.
            </p>
          </form>
        ) : (
          <div
            style={{
              width: '392px',
              flexShrink: 0,
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #DBE2EA',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              textAlign: 'left',
            }}
          >
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>
                Your complaints
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#677287' }}>
                Only you can see these.
              </p>
            </div>

            {listError && (
              <div role="alert" style={{ ...alertStyle, margin: '0 24px 12px' }}>
                {listError}
              </div>
            )}

            {allCases.length === 0 ? (
              <div style={{ padding: '16px 24px', borderTop: '1px solid #E8EDF3', fontSize: '13px', color: '#677287' }}>
                You have not filed any complaints with this account yet.
              </div>
            ) : (
              allCases.map((c) => {
                const isSelected = c.caseNumber === (complaint?.caseNumber ?? caseNumber)
                const subLabel =
                  c.type === 'employee'
                    ? `Employee · ${optionLabel(LOCATIONS, c.location)} · ${formatShortMonthDay(c.serviceDate, c.openedAt)}`
                    : `${c.type === 'food' ? 'Food' : 'Flight'} · ${c.flightNumber ?? 'FY308'} · ${formatShortMonthDay(c.serviceDate, c.openedAt)}`
                return (
                  <div
                    key={c.id}
                    onClick={() =>
                      void navigate({
                        to: '/complaints/check',
                        search: {
                          caseNumber: c.caseNumber,
                          bookingRef: undefined,
                          surname: undefined,
                          guest: undefined,
                        },
                      })
                    }
                    style={{
                      padding: '12px 24px',
                      borderTop: '1px solid #E8EDF3',
                      backgroundColor: isSelected ? '#E8EEF7' : '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#0A1424' }}>
                        {c.caseNumber}
                      </span>
                      <span style={{ fontSize: '12px', color: '#677287' }}>
                        {subLabel}
                      </span>
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                )
              })
            )}

            <div
              style={{
                borderTop: '1px solid #E8EDF2',
                padding: '14px 24px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '13px',
              }}
            >
              <span style={{ fontWeight: 500, color: '#0A1424' }}>
                Sent a complaint without signing in?
              </span>
              <span
                onClick={switchToGuestLookupView}
                style={{ fontWeight: 600, color: '#1F408C', cursor: 'pointer' }}
              >
                Check it with your booking reference →
              </span>
            </div>
          </div>
        )}

        {/* Right Column (784px): Card / Case detail (06c / 06 / 06d) */}
        <div style={{ flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {caseError && (
            <div role="alert" style={alertStyle}>
              {caseError}
            </div>
          )}

          {complaint ? (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #DBE2EA',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                textAlign: 'left',
              }}
            >
              {/* Top Row: Case Number + Type Pill & Status Pill */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0A1424' }}>
                  {complaint.caseNumber}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      border: '1px solid #D1D9E3',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#454F61',
                      textTransform: 'capitalize',
                    }}
                  >
                    {complaint.type}
                  </div>
                  <StatusPill status={complaint.status} />
                </div>
              </div>

              {/* Horizontal Status Tracker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {TRACKER_STEPS.map((step, idx) => {
                  const isReached = idx <= currentStepIdx
                  const isCurrent = idx === currentStepIdx
                  return (
                    <div key={step.status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {idx > 0 && (
                        <div
                          style={{
                            width: '28px',
                            height: '2px',
                            backgroundColor: isReached ? '#102544' : '#E8EDF3',
                          }}
                        />
                      )}
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '999px',
                          backgroundColor: isReached ? '#102544' : '#E8EDF3',
                          color: isReached ? '#FFFFFF' : '#677287',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </div>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: isCurrent ? 600 : 500,
                          color: isCurrent ? '#0A1424' : '#677287',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Facts Box */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E8EDF3',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {complaint.type === 'employee' ? (
                  <>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          WHERE
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {optionLabel(LOCATIONS, complaint.location)}
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          DATE
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {dateFactValue}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          STAFF MEMBER
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {complaint.staffName || '—'}
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          BOOKING
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {activeBookingRef}
                        </span>
                      </div>
                    </div>
                  </>
                ) : complaint.type === 'food' ? (
                  <>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          FLIGHT
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {flightFactValue}
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          DATE
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {dateFactValue}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          MEAL
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {complaint.mealDetail || 'Vegetarian meal (VGML)'}
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          ISSUE
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {issueFactValue}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          FLIGHT
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {flightFactValue}
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          DATE
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {dateFactValue}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          ISSUE
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {issueFactValue}
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                          BOOKING
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>
                          {activeBookingRef}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>
                    WHAT YOU TOLD US
                  </span>
                  <span style={{ fontSize: '14px', color: '#0A1424', lineHeight: 1.5 }}>
                    “{complaint.description}”
                  </span>
                </div>
              </div>

              {/* Next Step Info Box */}
              <div
                style={{
                  backgroundColor: '#EFF4FF',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#1F408C', lineHeight: 1.2 }}>
                  ⓘ
                </span>
                <span style={{ fontSize: '13px', color: '#29427A', lineHeight: 1.45 }}>
                  {isGuestMode
                    ? `What happens next: a Customer Service supervisor reviews new cases, usually within 2 days. We email the address on booking ${activeBookingRef} each time the status changes.`
                    : `What happens next: a Customer Service supervisor reviews new cases, usually within 2 days. We email you at ${complaint.contactEmail || user?.email || 'somchai.w@example.com'} each time the status changes.`}
                </span>
              </div>

              {/* History Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>
                  History
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {timelineItems.map((item, idx) => {
                    const isLast = idx === timelineItems.length - 1
                    return (
                      <div key={item.id} style={{ display: 'flex', gap: '14px', alignItems: 'stretch' }}>
                        {/* Rail */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            paddingTop: '4px',
                            gap: '4px',
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '999px',
                              backgroundColor: item.dotColor === 'blue' ? '#2563EB' : '#16A34A',
                              flexShrink: 0,
                            }}
                          />
                          {!isLast && (
                            <div
                              style={{
                                width: '2px',
                                flex: 1,
                                minHeight: '16px',
                                backgroundColor: '#E1E6ED',
                              }}
                            />
                          )}
                        </div>

                        {/* Text */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            paddingBottom: '14px',
                            flex: 1,
                          }}
                        >
                          <span style={{ fontSize: '12px', color: '#677287' }}>{item.time}</span>
                          <span style={{ fontSize: '14px', color: '#0A1424' }}>{item.title}</span>
                          {item.subtext && (
                            <span style={{ fontSize: '13px', color: '#677287' }}>{item.subtext}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <p style={{ margin: 0, fontSize: '12px', color: '#677287' }}>
                  Notes the team writes for each other are not shown here.
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/complaints' })}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #C7CFDB',
                    borderRadius: '10px',
                    padding: '11px 18px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#0A1424',
                    cursor: 'pointer',
                  }}
                >
                  Make another complaint
                </button>
              </div>
            </div>
          ) : (
            /* Empty / Before checking state matching Figma 06d (5585:36345) */
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #DBE2EA',
                padding: '28px',
                minHeight: '360px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>
                Your case will show here
              </div>
              <div style={{ fontSize: '14px', color: '#677287', maxWidth: '420px', lineHeight: 1.5 }}>
                {isGuestMode
                  ? 'Enter the case number from your email, plus the booking reference and surname on the booking.'
                  : 'Select one of your complaints on the left to view its status and full history.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </ComplaintPage>
  )
}
