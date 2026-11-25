import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import type { AppUser } from '@customer-web/auth/AuthProvider'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { cn } from '@customer-web/lib/utils'
import { errorMessage, useComplaintsApi } from './api'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, optionLabel, type CaseStatus, type Complaint } from './types'
import { Fact, StatusBadge, StatusTracker } from './parts'
import { AccountGate, ComplaintPage } from './ui'

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
  /** The latest step is marked with the primary colour. */
  latest: boolean
}

/** The customer's history, built only from the case's own (non-internal) events. */
function buildTimeline(complaint: Complaint): TimelineItem[] {
  const items: Omit<TimelineItem, 'latest'>[] = []
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
  return items.map((item, idx) => ({ ...item, latest: idx === items.length - 1 }))
}

export function CheckCasePage() {
  return (
    <ComplaintPage current="/complaints/check" title="Your complaints" subtitle="Check the status and history of your cases.">
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

function DetailPlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="min-h-80 justify-center text-center">
      <CardHeader className="items-center">
        <CardTitle>{title}</CardTitle>
        {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
      </CardHeader>
    </Card>
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
          <Link to="/complaints" className="font-medium text-foreground underline underline-offset-4">
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
      <Card role="status" className="min-h-80 items-center justify-center text-sm text-muted-foreground">
        Loading case {selected}…
      </Card>
    )
  } else if (current.error !== undefined) {
    detailPane = (
      <Alert variant="destructive">
        <AlertDescription>{current.error}</AlertDescription>
      </Alert>
    )
  } else {
    detailPane = <CaseDetail key={current.caseNumber} complaint={current.complaint} user={user} onReopened={onReopened} />
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="py-5">
          <CardTitle>Your complaints</CardTitle>
          <CardDescription>Only you can see these.</CardDescription>
        </CardHeader>

        {list.status === 'loading' ? (
          <p role="status" className="border-t px-6 py-4 text-sm text-muted-foreground">
            Loading your complaints…
          </p>
        ) : list.status === 'error' ? (
          <div className="flex flex-col gap-3 px-6 pb-4">
            <Alert variant="destructive">
              <AlertDescription>We couldn't load your complaints. {list.message}</AlertDescription>
            </Alert>
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={retryList}>
              Try again
            </Button>
          </div>
        ) : list.cases.length === 0 ? (
          <p className="border-t px-6 py-4 text-sm text-muted-foreground">You have not filed any complaints with this account yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
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
                <li key={c.id} className="border-t">
                  <Link
                    to="/complaints/check"
                    search={{ caseNumber: c.caseNumber }}
                    aria-current={isSelected ? 'true' : undefined}
                    className={cn(
                      'flex items-center justify-between gap-3 px-6 py-3 no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
                      isSelected ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">{c.caseNumber}</span>
                      <span className="text-xs text-muted-foreground">{subLabel}</span>
                    </span>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div className="flex min-w-0 flex-col gap-4">{detailPane}</div>
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
  const timelineItems = buildTimeline(complaint)

  // flightRoute is "FY402 · BKK → CNX · Mon 23 Nov", or '—' when the case has no flight.
  const flightFactValue =
    complaint.flightRoute && complaint.flightRoute !== '—'
      ? complaint.flightRoute.split('·').slice(0, 2).join('·').trim()
      : complaint.flightNumber || '—'
  const dateFactValue = caseDate(WEEKDAY_DAY_MONTH, complaint.serviceDate, complaint.openedAt)
  const issueFactValue = optionLabel(complaint.type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES, complaint.issue) || '—'

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-2xl font-semibold tracking-tight">{complaint.caseNumber}</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {complaint.type}
            </Badge>
            <StatusBadge status={complaint.status} />
          </div>
        </div>

        <StatusTracker status={complaint.status} />

        <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4">
          <dl className="m-0 grid gap-4 sm:grid-cols-2">
            {complaint.type === 'employee' ? (
              <>
                <Fact label="Where">{optionLabel(LOCATIONS, complaint.location)}</Fact>
                <Fact label="Date">{dateFactValue}</Fact>
                <Fact label="Staff member">{complaint.staffName || '—'}</Fact>
                <Fact label="Booking">{activeBookingRef || '—'}</Fact>
              </>
            ) : (
              <>
                <Fact label="Flight">{flightFactValue}</Fact>
                <Fact label="Date">{dateFactValue}</Fact>
                {complaint.type === 'food' ? (
                  <>
                    <Fact label="Meal">{complaint.mealDetail || '—'}</Fact>
                    <Fact label="Issue">{issueFactValue}</Fact>
                  </>
                ) : (
                  <>
                    <Fact label="Issue">{issueFactValue}</Fact>
                    <Fact label="Booking">{activeBookingRef || '—'}</Fact>
                  </>
                )}
              </>
            )}
          </dl>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase">What you told us</span>
            <p className="text-sm">“{complaint.description}”</p>
          </div>
        </div>

        <Alert>
          <Info />
          <AlertDescription>
            {NEXT_STEP[complaint.status]} We email you at {complaint.contactEmail || user.email} each time the status changes.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-base font-semibold">History</h3>
          <ol className="m-0 flex list-none flex-col p-0">
            {timelineItems.map((item, idx) => (
              <li key={item.id} className="flex items-stretch gap-3.5">
                <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
                  <span className={cn('size-3 shrink-0 rounded-full', item.latest ? 'bg-primary' : 'bg-ok')} />
                  {idx < timelineItems.length - 1 && <span className="min-h-4 w-0.5 flex-1 bg-border" />}
                </div>
                <div className="flex flex-1 flex-col gap-0.5 pb-3.5">
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                  <span className="text-sm">{item.title}</span>
                  {item.subtext && <span className="text-sm text-muted-foreground">{item.subtext}</span>}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">Notes the team writes for each other are not shown here.</p>
        </div>

        {complaint.status === 'closed' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm">Not happy with the result? You can reopen within 7 days of closing.</p>
            {reopenError && (
              <Alert variant="destructive">
                <AlertDescription>{reopenError}</AlertDescription>
              </Alert>
            )}
            <Button type="button" className="self-start" disabled={reopening} onClick={() => void reopen()}>
              {reopening ? 'Reopening…' : 'Reopen case'}
            </Button>
          </div>
        )}

        <div>
          <Button asChild variant="outline">
            <Link to="/complaints">Make another complaint</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
