import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { AppUser } from '@customer-web/auth/AuthProvider'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnPrimary, btnSecondary, focusRing, focusRingInset, mutedStyle } from './styles'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, STATUS_LABEL, optionLabel, type CaseStatus, type Complaint } from './types'
import { AccountGate, ComplaintPage, ComplaintsNav } from './ui'

const TRACKER_STEPS: { status: CaseStatus; label: string }[] = [
  { status: 'with_supervisor', label: 'With supervisor' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'resolved', label: 'Resolved' },
  { status: 'closed', label: 'Closed' },
]

// Times are shown in Bangkok time, the airline's home time zone. A flight's service date is a calendar date (YYYY-MM-DD,
// read as UTC midnight), so it is formatted in UTC to stay the same day.
const HOME_TIME_ZONE = 'Asia/Bangkok'
const SHORT_TIMESTAMP = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: HOME_TIME_ZONE,
})
const WEEKDAY_DAY_MONTH = { weekday: 'short', day: 'numeric', month: 'short' } as const
const DAY_MONTH = { day: 'numeric', month: 'short' } as const

/** Formats an ISO timestamp; '—' when it cannot be read. */
function formatTime(format: Intl.DateTimeFormat, value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : format.format(d)
}

/** The flight's service date as a calendar date, or the day the case was opened in Bangkok when there is no flight. */
function caseDate(options: Intl.DateTimeFormatOptions, serviceDate: string | null, openedAt: string): string {
  const timeZone = serviceDate ? 'UTC' : HOME_TIME_ZONE
  return formatTime(new Intl.DateTimeFormat('en-GB', { ...options, timeZone }), serviceDate ?? openedAt)
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

/** What happens next, for the case's current status. */
const NEXT_STEP: Record<CaseStatus, string> = {
  with_supervisor: 'What happens next: a Customer Service supervisor reviews new cases, usually within 2 days.',
  assigned: 'What happens next: a Customer Service agent is looking into your case.',
  resolved: 'Your case is resolved. It will be closed once Customer Service has finished with it.',
  closed: 'This case is closed.',
}

interface TimelineItem {
  id: string
  time: string
  title: string
  subtext?: string
  dotColor: 'green' | 'blue'
}

/** The customer's history, built only from the case's own (non-internal) events. */
function buildTimeline(complaint: Complaint): TimelineItem[] {
  const items: Omit<TimelineItem, 'dotColor'>[] = []
  for (const ev of complaint.events ?? []) {
    const time = formatTime(SHORT_TIMESTAMP, ev.occurredAt)
    if (ev.type === 'created') {
      items.push({ id: ev.id, time, title: 'You sent the complaint' })
    } else if (ev.type === 'routed_to_supervisor') {
      items.push({ id: ev.id, time, title: 'Sent to the Customer Service supervisor' })
    } else if (ev.type === 'assigned') {
      items.push({ id: ev.id, time, title: 'Assigned to a Customer Service agent' })
    } else if (ev.type === 'status_changed' && ev.toValue === 'resolved') {
      items.push({ id: ev.id, time, title: 'Marked resolved by Customer Service', subtext: ev.note || undefined })
    } else if (ev.type === 'compensation_decided') {
      items.push({ id: ev.id, time, title: ev.title || `Compensation approved (${ev.toValue ?? ''})` })
    } else if (ev.type === 'closed') {
      items.push({ id: ev.id, time, title: 'Case closed' })
    } else if (ev.type === 'reopened') {
      items.push({ id: ev.id, time, title: 'Case reopened and sent to supervisor' })
    }
  }
  return items.map((item, idx) => ({ ...item, dotColor: idx === items.length - 1 ? 'blue' : 'green' }))
}

export function CheckCasePage() {
  return (
    <ComplaintPage>
      <ComplaintsNav current="/complaints/check" />
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '26px',
            fontWeight: 700,
            color: '#0A1424',
            letterSpacing: '-0.02em',
          }}
        >
          Your complaints
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#677287' }}>Check the status and history of your cases.</p>
      </div>
      <AccountGate signInTitle="Sign in to check your cases" redirect="/complaints/check">
        {(user) => <CaseBrowser user={user} />}
      </AccountGate>
    </ComplaintPage>
  )
}

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cases: Complaint[] }

/** The loaded case, or the error, for one case number; a different case number means the new one is still loading. */
type DetailState =
  { caseNumber: string; complaint: Complaint; error?: undefined } | { caseNumber: string; complaint?: undefined; error: string }

const panelStyle = {
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
} as const

function DetailPlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={panelStyle}>
      <div style={{ fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>{title}</div>
      {children && <div style={{ fontSize: '14px', color: '#677287', maxWidth: '420px', lineHeight: 1.5 }}>{children}</div>}
    </div>
  )
}

function CaseBrowser({ user }: { user: AppUser }) {
  const navigate = useNavigate()
  const { caseNumber } = useSearch({ from: '/complaints/check' })
  const selected = caseNumber?.trim().toUpperCase() || undefined
  const api = useComplaintsApi()

  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [listAttempt, setListAttempt] = useState(0)
  const [detail, setDetail] = useState<DetailState | null>(null)

  const fetchList = useEffectEvent(() => api.list())
  const fetchCase = useEffectEvent((n: string) => api.get(n))

  // Opens the newest case when the list loads and none is chosen yet. `replace` keeps Back from returning to the bare URL,
  // which would open the first case again.
  const openFirstCase = useEffectEvent((rows: Complaint[]) => {
    if (!selected && rows.length > 0) {
      void navigate({ to: '/complaints/check', search: { caseNumber: rows[0].caseNumber }, replace: true })
    }
  })

  useEffect(() => {
    let cancelled = false
    fetchList().then(
      (rows) => {
        if (cancelled) return
        setList({ status: 'ready', cases: rows })
        openFirstCase(rows)
      },
      (e: unknown) => {
        if (!cancelled) setList({ status: 'error', message: errorMessage(e) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [listAttempt])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    fetchCase(selected).then(
      (row) => {
        if (!cancelled) setDetail({ caseNumber: selected, complaint: row })
      },
      (e: unknown) => {
        if (!cancelled) setDetail({ caseNumber: selected, error: errorMessage(e) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [selected])

  function retryList() {
    setList({ status: 'loading' })
    setListAttempt((n) => n + 1)
  }

  function onReopened(updated: Complaint) {
    setDetail({ caseNumber: updated.caseNumber, complaint: updated })
    setList((prev) =>
      prev.status === 'ready' ? { ...prev, cases: prev.cases.map((c) => (c.caseNumber === updated.caseNumber ? updated : c)) } : prev,
    )
  }

  // Only the detail for the case in the URL counts; anything else is from the previous selection.
  const current = selected && detail?.caseNumber === selected ? detail : null

  let detailPane: ReactNode
  if (!selected) {
    detailPane =
      list.status === 'ready' && list.cases.length === 0 ? (
        <DetailPlaceholder title="No complaints yet">
          When you make a complaint, its status and history show here.{' '}
          <Link to="/complaints" className={focusRing} style={{ color: '#2563EB', fontWeight: 600 }}>
            Make a complaint
          </Link>
        </DetailPlaceholder>
      ) : (
        <DetailPlaceholder title="Your case will show here">
          Select one of your complaints on the left to view its status and full history.
        </DetailPlaceholder>
      )
  } else if (!current) {
    detailPane = (
      <div role="status" style={panelStyle}>
        <span style={mutedStyle}>Loading case {selected}…</span>
      </div>
    )
  } else if (current.error !== undefined) {
    detailPane = (
      <div role="alert" style={alertStyle}>
        {current.error}
      </div>
    )
  } else {
    detailPane = <CaseDetail key={current.caseNumber} complaint={current.complaint} user={user} onReopened={onReopened} />
  }

  return (
    /* Two Column Layout matching Figma (Left 392px, gap 24px, Right 784px) */
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      {/* Left Column (392px): Card / Your complaints */}
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>Your complaints</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#677287' }}>Only you can see these.</p>
        </div>

        {list.status === 'loading' ? (
          <div role="status" style={{ padding: '16px 24px', borderTop: '1px solid #E8EDF3', fontSize: '13px', color: '#677287' }}>
            Loading your complaints…
          </div>
        ) : list.status === 'error' ? (
          <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div role="alert" style={alertStyle}>
              We couldn't load your complaints. {list.message}
            </div>
            <button type="button" onClick={retryList} className={focusRing} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>
              Try again
            </button>
          </div>
        ) : list.cases.length === 0 ? (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #E8EDF3', fontSize: '13px', color: '#677287' }}>
            You have not filed any complaints with this account yet.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.cases.map((c) => {
              const isSelected = c.caseNumber === selected
              const date = caseDate(DAY_MONTH, c.serviceDate, c.openedAt)
              const subLabel = (
                c.type === 'employee'
                  ? ['Employee', optionLabel(LOCATIONS, c.location), date]
                  : [c.type === 'food' ? 'Food' : 'Flight', c.flightNumber, date]
              )
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={c.id} style={{ borderTop: '1px solid #E8EDF3' }}>
                  <Link
                    to="/complaints/check"
                    search={{ caseNumber: c.caseNumber }}
                    aria-current={isSelected ? 'true' : undefined}
                    className={focusRingInset}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: isSelected ? '#E8EEF7' : '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      textDecoration: 'none',
                    }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#0A1424' }}>{c.caseNumber}</span>
                      <span style={{ fontSize: '12px', color: '#677287' }}>{subLabel}</span>
                    </span>
                    <StatusPill status={c.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Right Column (784px): Card / Case detail */}
      <div style={{ flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>{detailPane}</div>
    </div>
  )
}

function CaseDetail({ complaint, user, onReopened }: { complaint: Complaint; user: AppUser; onReopened: (updated: Complaint) => void }) {
  const api = useComplaintsApi()
  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState<string | null>(null)

  async function reopen() {
    setReopening(true)
    setReopenError(null)
    try {
      onReopened(await api.reopen(complaint.caseNumber))
    } catch (e) {
      setReopenError(errorMessage(e))
    } finally {
      setReopening(false)
    }
  }

  const activeBookingRef = complaint.bookingRef || ''
  const currentStepIdx = Math.max(
    0,
    TRACKER_STEPS.findIndex((s) => s.status === complaint.status),
  )
  const timelineItems = buildTimeline(complaint)

  // flightRoute is "FY402 · BKK → CNX · Mon 23 Nov", or '—' when the case has no flight.
  const flightFactValue =
    complaint.flightRoute && complaint.flightRoute !== '—'
      ? complaint.flightRoute.split('·').slice(0, 2).join('·').trim()
      : complaint.flightNumber || '—'
  const dateFactValue = caseDate(WEEKDAY_DAY_MONTH, complaint.serviceDate, complaint.openedAt)
  const issueFactValue = optionLabel(complaint.type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES, complaint.issue) || '—'

  return (
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
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#0A1424' }}>{complaint.caseNumber}</div>
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
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>WHERE</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{optionLabel(LOCATIONS, complaint.location)}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>DATE</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{dateFactValue}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>STAFF MEMBER</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{complaint.staffName || '—'}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>BOOKING</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{activeBookingRef || '—'}</span>
              </div>
            </div>
          </>
        ) : complaint.type === 'food' ? (
          <>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>FLIGHT</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{flightFactValue}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>DATE</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{dateFactValue}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>MEAL</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{complaint.mealDetail || '—'}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>ISSUE</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{issueFactValue}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>FLIGHT</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{flightFactValue}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>DATE</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{dateFactValue}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>ISSUE</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{issueFactValue}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>BOOKING</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0A1424' }}>{activeBookingRef || '—'}</span>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#677287', letterSpacing: '0.6px' }}>WHAT YOU TOLD US</span>
          <span style={{ fontSize: '14px', color: '#0A1424', lineHeight: 1.5 }}>“{complaint.description}”</span>
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
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#1F408C', lineHeight: 1.2 }}>ⓘ</span>
        <span style={{ fontSize: '13px', color: '#29427A', lineHeight: 1.45 }}>
          {NEXT_STEP[complaint.status]} We email you at {complaint.contactEmail || user.email} each time the status changes.
        </span>
      </div>

      {/* History Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>History</h3>

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
                  {item.subtext && <span style={{ fontSize: '13px', color: '#677287' }}>{item.subtext}</span>}
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ margin: 0, fontSize: '12px', color: '#677287' }}>Notes the team writes for each other are not shown here.</p>
      </div>

      {complaint.status === 'closed' && (
        <div
          style={{
            border: '1px solid #E8EDF3',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '14px', color: '#0A1424' }}>Not happy with the result? You can reopen within 7 days of closing.</span>
          {reopenError && (
            <div role="alert" style={alertStyle}>
              {reopenError}
            </div>
          )}
          <button
            type="button"
            disabled={reopening}
            onClick={() => void reopen()}
            className={focusRing}
            style={{ ...btnPrimary, alignSelf: 'flex-start', opacity: reopening ? 0.7 : 1, cursor: reopening ? 'not-allowed' : 'pointer' }}
          >
            {reopening ? 'Reopening…' : 'Reopen case'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <Link
          to="/complaints"
          className={focusRing}
          style={{
            textDecoration: 'none',
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
        </Link>
      </div>
    </div>
  )
}
