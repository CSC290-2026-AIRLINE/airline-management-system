import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Separator } from '@staff-web/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { errorMessage, useComplaintsApi } from './api'
import { StatusBadge, TypeBadge } from './ComplaintBadges'
import { PageFrame } from './components/PageFrame'
import { StatCard } from './components/StatCard'
import { formatDateTime } from './format'
import { STATUS_LABEL, humanize, type CaseStatus, type Complaint, type ComplaintType } from './types'

const REFRESH_MS = 10_000

const TYPE_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'employee', label: 'Employee' },
  { key: 'flight', label: 'Flight' },
  { key: 'food', label: 'Food' },
] as const

const STATUS_CHIPS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
] as const

/** What the backend's refusal codes mean, in words staff can act on. Anything else is already a sentence. */
const ACTION_ERRORS: Record<string, string> = {
  INVALID_STATUS: 'This case is already resolved or closed, so its owner can no longer be changed.',
  NOT_CASE_OWNER: 'Only the case owner or the supervisor can do this.',
  COMPENSATION_EXISTS: 'This case already has a compensation decision.',
}

function actionErrorText(message: string): string {
  return ACTION_ERRORS[message] ?? message
}

/** Where the case came from, as staff read it. */
function sourceLabel(source: Complaint['fromSource']): string {
  return source === 'Feature 10' ? 'Lost bag report' : 'Customer'
}

const COMPENSATION_STATUS: Record<NonNullable<Complaint['compensation']>['status'], string> = {
  pending: 'Sent for payment',
  paid: 'Paid',
  failed: 'Payment failed',
}

function shortCaseNo(caseNumber: string): string {
  const parts = caseNumber.split('-')
  return parts[parts.length - 1] || caseNumber
}

/** A row that opens its case on click, Enter or Space, so the queue works from the keyboard too. */
function openRowProps(onOpen: () => void) {
  return {
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    },
  }
}

function FilterChips<K extends string>({
  label,
  chips,
  value,
  onChange,
}: {
  label: string
  chips: readonly { key: K; label: string }[]
  value: K
  onChange: (next: K) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-0.5 text-[11px] font-semibold text-muted-foreground uppercase">{label}</span>
      {chips.map((chip) => (
        <Button
          key={chip.key}
          type="button"
          size="xs"
          variant={value === chip.key ? 'default' : 'outline'}
          aria-pressed={value === chip.key}
          className="rounded-full px-2.5"
          onClick={() => onChange(chip.key)}
        >
          {chip.label}
        </Button>
      ))}
    </div>
  )
}

function UnreadDot() {
  return <span className="size-2 shrink-0 rounded-full bg-blue-600" aria-label="New" />
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold text-muted-foreground uppercase">{label}</dt>
      <dd className="m-0 text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

function ActionRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex w-32 shrink-0 flex-col gap-0.5 sm:pt-2">
        <span className="text-sm font-semibold text-muted-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</div>
    </div>
  )
}

export function ComplaintsDashboard() {
  const api = useComplaintsApi()
  const [complaints, setComplaints] = useState<Complaint[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [staffMembers, setStaffMembers] = useState<{ id: string; name: string; roleCode: string }[] | null>(null)
  const [staffError, setStaffError] = useState<string | null>(null)
  const [currentStaff, setCurrentStaff] = useState<{ id: string; name: string; roleCode: string; isSupervisor: boolean } | null>(null)
  const [meError, setMeError] = useState<string | null>(null)

  // Figma Filters: TYPE (All | Employee | Flight | Food), STATUS (Open | Resolved | Closed | All), OWNER
  const [filterType, setFilterType] = useState<ComplaintType | 'all'>('all')
  const [filterStatusChip, setFilterStatusChip] = useState<'open' | 'resolved' | 'closed' | 'all'>('open')
  const [filterOwner, setFilterOwner] = useState<string>('Anyone')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Detail panel form state
  const [ownerDraft, setOwnerDraft] = useState<string>('')
  const [resolutionDraft, setResolutionDraft] = useState<string>('Not a duplicate')
  const [noteDraft, setNoteDraft] = useState<string>('')
  const [compTypeDraft, setCompTypeDraft] = useState<'voucher' | 'refund'>('voucher')
  const [compAmountDraft, setCompAmountDraft] = useState<string>('1,000')
  const [compReasonDraft, setCompReasonDraft] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // The error shows inside the actions box, and is scrolled into view, so it is next to the button that was clicked.
  const actionErrorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (actionError) actionErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [actionError])

  const fetchList = useEffectEvent(() => api.list())
  const loadStaffContext = useEffectEvent(() => {
    // A failure here is shown, not swallowed: without it the page would quietly treat the user as a non-supervisor.
    void api
      .getStaffMembers()
      .then(setStaffMembers)
      .catch((e: unknown) => setStaffError(errorMessage(e)))
    void api
      .getMe()
      .then(setCurrentStaff)
      .catch((e: unknown) => setMeError(errorMessage(e)))
  })

  useEffect(() => {
    loadStaffContext()
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = () =>
      fetchList().then(
        (rows) => {
          if (cancelled) return
          setComplaints(rows)
          setLoadError(null)
        },
        (e: unknown) => {
          if (!cancelled) setLoadError(errorMessage(e))
        },
      )
    void tick()
    const interval = setInterval(() => void tick(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [reloadToken])

  const all = complaints ?? []
  const openCasesCount = all.filter((c) => c.status === 'with_supervisor' || c.status === 'assigned').length
  const waitingOwnerCount = all.filter((c) => c.status === 'with_supervisor').length
  const resolvedCount = all.filter((c) => c.status === 'resolved').length
  const closedCount = all.filter((c) => c.status === 'closed').length
  const resolvedOrClosedCount = resolvedCount + closedCount

  const filtered = all.filter((c) => {
    const matchType = filterType === 'all' || c.type === filterType
    const matchStatus =
      filterStatusChip === 'all'
        ? true
        : filterStatusChip === 'open'
          ? c.status === 'with_supervisor' || c.status === 'assigned'
          : c.status === filterStatusChip
    const matchOwner = filterOwner === 'Anyone' ? true : filterOwner === 'Unassigned' ? !c.ownerName : c.ownerName === filterOwner
    return matchType && matchStatus && matchOwner
  })

  const selected = all.find((c) => c.id === selectedId) ?? null

  // Reset the edit drafts only when another case is selected, not on every poll that refreshes `selected`.
  const resetDrafts = useEffectEvent(() => {
    if (!selected) return
    setOwnerDraft(selected.ownerStaffId ?? '')
    setResolutionDraft('Not a duplicate')
    setNoteDraft('')
    // A decided case shows its decision instead of the form, so the form always starts empty.
    setCompTypeDraft('voucher')
    setCompAmountDraft('1,000')
    setCompReasonDraft('')
    setActionError(null)
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the edit drafts when another case is selected
    resetDrafts()
  }, [selected?.id])

  /** Runs one staff action, then reloads; a refused action shows its error instead of failing silently. */
  async function runAction(work: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await work()
      setReloadToken((n) => n + 1)
    } catch (e) {
      setActionError(actionErrorText(errorMessage(e)))
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign() {
    if (!selected || !ownerDraft) return
    await runAction(() => api.assignOwner(selected.id, ownerDraft))
  }

  async function handleResolve() {
    if (!selected || !selected.ownerName) return
    await runAction(() => api.setStatus(selected.id, 'resolved', resolutionDraft))
  }

  async function handleAddNote() {
    if (!selected || !noteDraft.trim()) return
    await runAction(async () => {
      await api.addNote(selected.id, noteDraft.trim())
      setNoteDraft('')
    })
  }

  async function handleSendComp() {
    if (!selected || !compReasonDraft.trim()) return
    const amount = Number(String(compAmountDraft).replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError('Enter a compensation amount above 0.')
      return
    }
    await runAction(async () => {
      await api.sendCompensation(selected.id, { type: compTypeDraft, amount, reason: compReasonDraft.trim() })
      setCompReasonDraft('')
    })
  }

  async function handleCloseCase() {
    if (!selected) return
    await runAction(() => api.setStatus(selected.id, 'closed'))
  }

  const supervisor = Boolean(currentStaff?.isSupervisor)
  // Mirrors the backend: an agent works only their own cases; the supervisor may act on any case.
  const canWorkCase = Boolean(selected && currentStaff && (supervisor || selected.ownerStaffId === currentStaff.id))
  const compBlocked = busy || !compReasonDraft.trim() || !supervisor
  // A resolved or closed case keeps its owner (the backend refuses INVALID_STATUS).
  const canReassign = Boolean(selected && (selected.status === 'with_supervisor' || selected.status === 'assigned'))
  const loading = complaints === null && !loadError

  return (
    <PageFrame
      title="Complaint queue"
      description="Every new complaint comes here first. Assign it, add notes, decide compensation and close it."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open cases" value={loading ? '—' : openCasesCount} />
        <StatCard label="Waiting for an owner" value={loading ? '—' : waitingOwnerCount} />
        <StatCard label="Resolved or closed" value={loading ? '—' : resolvedOrClosedCount} />
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription className="block">Could not load complaints: {loadError}</AlertDescription>
        </Alert>
      )}

      {meError && (
        <Alert variant="destructive">
          <AlertDescription className="block">
            Could not load your staff role, so case actions are turned off: {meError}. Reload the page to try again.
          </AlertDescription>
        </Alert>
      )}

      {staffError && (
        <Alert variant="destructive">
          <AlertDescription className="block">
            Could not load the staff list, so cases can’t be filtered by or assigned to an owner: {staffError}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-start">
        <Card className={cn('gap-0 overflow-hidden py-0 shadow-none', selected ? 'lg:w-[380px] lg:shrink-0' : 'w-full')}>
          <div className="flex flex-col gap-0.5 p-4">
            <h2 className="text-base font-bold text-foreground">Complaints</h2>
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              Open first, unassigned on top · <UnreadDot /> new since you last looked
            </p>
          </div>

          <div className={cn('flex flex-wrap gap-x-6 gap-y-2 px-4 pb-3', selected ? 'flex-col' : 'items-center')}>
            <FilterChips
              label="Type"
              chips={TYPE_CHIPS}
              value={filterType}
              onChange={(next) => setFilterType(next as ComplaintType | 'all')}
            />
            <FilterChips label="Status" chips={STATUS_CHIPS} value={filterStatusChip} onChange={setFilterStatusChip} />
            <div className={cn('flex items-center gap-2', selected && 'w-full')}>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Owner</span>
              <NativeSelect
                aria-label="Owner"
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                className={selected ? 'flex-1' : 'w-56'}
              >
                <option value="Anyone">Anyone</option>
                <option value="Unassigned">Unassigned</option>
                {(staffMembers ?? []).map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="px-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableHead className="text-[11px] text-muted-foreground uppercase">Case no.</TableHead>
                  <TableHead className="text-[11px] text-muted-foreground uppercase">Type</TableHead>
                  {!selected && <TableHead className="text-[11px] text-muted-foreground uppercase">From</TableHead>}
                  <TableHead className="text-[11px] text-muted-foreground uppercase">Summary</TableHead>
                  {!selected && <TableHead className="text-[11px] text-muted-foreground uppercase">Status</TableHead>}
                  {!selected && <TableHead className="text-[11px] text-muted-foreground uppercase">Age</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={selected ? 3 : 6} className="py-8 text-center text-muted-foreground">
                      {complaints === null && !loadError ? 'Loading complaints…' : 'No complaints match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => {
                    const isRecent = c.age?.includes('min')
                    return (
                      <TableRow
                        key={c.id}
                        {...openRowProps(() => setSelectedId(c.id))}
                        data-state={c.id === selected?.id ? 'selected' : undefined}
                        className="cursor-pointer align-top focus-visible:bg-muted/50 focus-visible:outline-none"
                      >
                        <TableCell className={c.unread ? 'font-bold' : 'font-semibold'}>
                          <span className="flex items-center gap-2">
                            {c.unread && <UnreadDot />}
                            {shortCaseNo(c.caseNumber)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <TypeBadge type={c.type} />
                        </TableCell>
                        {!selected && <TableCell>{sourceLabel(c.fromSource)}</TableCell>}
                        <TableCell className={selected ? 'whitespace-normal' : 'max-w-0 w-full truncate'}>
                          {c.summary ?? c.description}
                        </TableCell>
                        {!selected && (
                          <TableCell>
                            <div className="flex flex-col items-start gap-0.5">
                              <StatusBadge status={c.status} />
                              <span className="text-xs text-muted-foreground">{c.ownerName ?? 'Unassigned'}</span>
                            </div>
                          </TableCell>
                        )}
                        {!selected && (
                          <TableCell className={cn('text-[13px]', isRecent ? 'font-semibold text-blue-600' : 'text-muted-foreground')}>
                            {c.age ?? '—'}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-2 border-t bg-page px-4 py-3 text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${openCasesCount} open · ${resolvedCount} resolved · ${closedCount} closed`}
          </div>
        </Card>

        {selected && (
          <Card className="min-w-0 flex-1 gap-4 p-5 shadow-none">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-foreground">{selected.caseNumber}</h2>
              <div className="ml-auto flex items-center gap-1.5">
                <TypeBadge type={selected.type} />
                <StatusBadge status={selected.status} />
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close panel" onClick={() => setSelectedId(null)}>
                <X />
              </Button>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">{selected.openedLabel ?? `Opened ${formatDateTime(selected.openedAt)}`}</p>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Fact label="From">
                {selected.passengerName} · {sourceLabel(selected.fromSource)}
              </Fact>
              <Fact label="Contact">{selected.contactEmail ?? '—'}</Fact>
              <Fact label="Booking">{selected.bookingRef ?? '—'}</Fact>
              {selected.type === 'employee' ? (
                <>
                  <Fact label="Location">{selected.location ? humanize(selected.location) : '—'}</Fact>
                  <Fact label="Staff member">{selected.staffName ?? 'Not named'}</Fact>
                </>
              ) : (
                <>
                  <Fact label="Flight">{selected.flightRoute ?? selected.flightNumber ?? '—'}</Fact>
                  {selected.type === 'food' && <Fact label="Meal">{selected.mealDetail ?? 'Not known'}</Fact>}
                  <Fact label="Issue">{selected.issue ? humanize(selected.issue) : '—'}</Fact>
                </>
              )}
            </dl>

            <blockquote className="m-0 rounded-lg bg-page px-3 py-2.5 text-sm leading-relaxed text-foreground">
              “{selected.description}”
            </blockquote>

            <div className="flex flex-col gap-4 rounded-lg border p-4">
              {actionError && (
                <div ref={actionErrorRef}>
                  <Alert variant="destructive">
                    <AlertDescription className="block">Could not save the change. {actionError}</AlertDescription>
                  </Alert>
                </div>
              )}

              <ActionRow label="Owner">
                <div className="flex flex-wrap gap-2">
                  <NativeSelect
                    aria-label="Owner"
                    value={ownerDraft}
                    onChange={(e) => setOwnerDraft(e.target.value)}
                    disabled={!supervisor || !canReassign}
                    className="h-9 min-w-56 flex-1"
                  >
                    <option value="">Pick who handles this case</option>
                    {(staffMembers ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roleCode})
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    className="shrink-0"
                    disabled={busy || !ownerDraft || !supervisor || !canReassign}
                    title={!supervisor ? 'Supervisor only' : undefined}
                    onClick={() => void handleAssign()}
                  >
                    Assign
                  </Button>
                </div>
                {!canReassign && <span className="text-xs text-muted-foreground">A resolved or closed case keeps its owner.</span>}
                {staffMembers === null && !staffError && <span className="text-xs text-muted-foreground">Loading staff…</span>}
                {staffMembers?.length === 0 && <span className="text-xs text-muted-foreground">No staff members to assign yet.</span>}
              </ActionRow>

              <ActionRow label="Resolution">
                <div className="flex flex-wrap gap-2">
                  <NativeSelect
                    aria-label="Resolution"
                    value={resolutionDraft}
                    disabled={!selected.ownerName}
                    onChange={(e) => setResolutionDraft(e.target.value)}
                    className="h-9 min-w-48 flex-1"
                  >
                    <option value="Not a duplicate">Not a duplicate</option>
                    <option value="Duplicate case">Duplicate case</option>
                    <option value="Customer withdrew">Customer withdrew</option>
                  </NativeSelect>
                  {canWorkCase && (
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={busy || selected.status !== 'assigned'}
                      onClick={() => void handleResolve()}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
                {!selected.ownerName ? (
                  <span className="text-xs text-muted-foreground">Assign an owner first. A case with no owner can’t be resolved.</span>
                ) : (
                  !canWorkCase && (
                    <span className="text-xs text-muted-foreground">
                      Only the case owner or the supervisor can resolve or close this case.
                    </span>
                  )
                )}
              </ActionRow>

              <ActionRow label="Internal note">
                <div className="flex flex-wrap gap-2">
                  <Input
                    aria-label="Internal note"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Staff only. Never shown to the customer."
                    className="h-9 min-w-48 flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={busy || !noteDraft.trim()}
                    onClick={() => void handleAddNote()}
                  >
                    Add note
                  </Button>
                </div>
              </ActionRow>

              <ActionRow label="Compensation" hint="Supervisor only">
                {selected.compensation ? (
                  <div className="flex flex-col gap-1 rounded-md bg-page px-3 py-2.5 text-sm">
                    <span className="font-semibold text-foreground">
                      {selected.compensation.type} · {selected.compensation.amount}
                    </span>
                    <span className="text-muted-foreground">
                      {COMPENSATION_STATUS[selected.compensation.status]} · decided {formatDateTime(selected.compensation.sentAt)}
                    </span>
                    {selected.compensation.failureReason && (
                      <span className="text-danger">Reason it failed: {selected.compensation.failureReason}</span>
                    )}
                    <span className="text-foreground">“{selected.compensation.reason}”</span>
                    <span className="text-xs text-muted-foreground">A case has one compensation decision.</span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <NativeSelect
                        aria-label="Compensation type"
                        value={compTypeDraft}
                        disabled={!supervisor}
                        onChange={(e) => setCompTypeDraft(e.target.value === 'refund' ? 'refund' : 'voucher')}
                        className="h-9 min-w-48 flex-1"
                      >
                        <option value="voucher">Travel voucher</option>
                        <option value="refund">Cash refund</option>
                      </NativeSelect>
                      <Input
                        aria-label="Compensation amount in THB"
                        value={compAmountDraft}
                        disabled={!supervisor}
                        onChange={(e) => setCompAmountDraft(e.target.value)}
                        className="h-9 w-32 shrink-0"
                      />
                    </div>
                    <Input
                      aria-label="Compensation reason"
                      value={compReasonDraft}
                      disabled={!supervisor}
                      onChange={(e) => setCompReasonDraft(e.target.value)}
                      placeholder="Reason (required, the customer sees it)"
                      className="h-9"
                    />
                    <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={compBlocked}
                        title={!supervisor ? 'Supervisor only' : undefined}
                        onClick={() => void handleSendComp()}
                      >
                        Send compensation
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {supervisor
                          ? 'Amount in THB. Paid by the payments team once sent.'
                          : 'Only the supervisor can decide compensation.'}
                      </span>
                    </div>
                  </>
                )}
              </ActionRow>

              <Separator />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex-1 text-xs text-muted-foreground">
                  Close only after Resolved. Every change goes to the history and the audit log.
                </span>
                {canWorkCase && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-danger/40 text-danger hover:bg-danger-soft hover:text-danger"
                    disabled={busy || selected.status !== 'resolved'}
                    onClick={() => void handleCloseCase()}
                  >
                    Close case
                  </Button>
                )}
              </div>
            </div>

            <h3 className="text-base font-bold text-foreground">History and internal notes</h3>
            <ol className="m-0 flex list-none flex-col p-0">
              {(selected.events ?? []).map((ev, idx, arr) => {
                const isLast = idx === arr.length - 1
                const headerText = `${ev.timeLabel ?? formatDateTime(ev.occurredAt)} · ${ev.actorLabel ?? ev.actorName ?? 'System'}`
                const bodyText =
                  ev.title ??
                  ev.note ??
                  (ev.type === 'created'
                    ? `Created by customer (${selected.contactEmail ?? ''})`
                    : ev.toValue
                      ? `Status changed to ${STATUS_LABEL[ev.toValue as CaseStatus] ?? ev.toValue}`
                      : humanize(ev.type))

                return (
                  <li key={ev.id} className="flex items-stretch gap-3.5">
                    <div className="flex w-3 shrink-0 flex-col items-center pt-1" aria-hidden="true">
                      <span
                        className={cn('size-2.5 shrink-0 rounded-full', isLast ? 'bg-blue-600 ring-2 ring-blue-100' : 'bg-slate-400')}
                      />
                      {!isLast && <span className="mt-1 w-0.5 flex-1 bg-line" />}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 pb-3">
                      <span className="text-xs text-muted-foreground">{headerText}</span>
                      <span className="text-sm text-foreground">{bodyText}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Card>
        )}
      </div>
    </PageFrame>
  )
}
