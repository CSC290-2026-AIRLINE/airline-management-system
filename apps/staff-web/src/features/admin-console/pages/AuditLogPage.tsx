import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, CircleAlert, SlidersHorizontal, X } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { cn } from '@staff-web/lib/utils'
import { useGetAuditEntry, useListAudit } from '../api/audit'
import { useAuditLog } from '../hooks/useAuditLog'
import { FEATURE_NUMBERS, featureLabel } from '../feature-labels'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { AuditEntry, AuditFilters, AuditPage } from '../types'

/* Filter dropdowns mirror the AUDIT_ACTIONS check in the DB. Keep these in lockstep with
 * apps/backend/src/modules/admin-console/dto/audit-query.dto.ts — the backend rejects anything not in the list, so
 * a mismatched set on this side silently filters out every row. */
const ACTION_TYPES = [
  'sign_in',
  'sign_out',
  'sign_in_blocked',
  'access_denied',
  'create',
  'update',
  'delete',
  'view_sensitive',
  'role_change',
  'status_change',
  'screen_access_change',
] as const
type ActionType = (typeof ACTION_TYPES)[number]

const ACTOR_TYPES = ['staff', 'customer', 'system'] as const

/* Display helpers ---------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n: number) => String(n).padStart(2, '0')

/** `12 Oct 10:30 AM` in the viewer's local time (12-hour clock). */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const h = d.getHours()
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${h % 12 || 12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

/** `2026-10-10` → `10 Oct`. Date-only, so a plain string split avoids the timezone shift `new Date()` introduces. */
function shortDate(iso: string | undefined): string {
  if (!iso) return '…'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`
}

/** `PAYMENTS` → `Payments`, `CHECK-IN` → `Check-in`, `&` stays `&`. */
function titleCase(label: string): string {
  return label
    .split(' ')
    .map((w) => (w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ')
}

/** `15` → `F15 Admin Console`; a feature with no label shows its number only. */
function featureName(featureNo: string): string {
  const no = featureNo.replace(/^0+(?=\d)/, '')
  const label = featureLabel(featureNo)
  return label.startsWith('FEATURE ') ? `F${no}` : `F${no} ${titleCase(label)}`
}

/** Badge wording and colours per action, from the audit log frames. */
const ACTION_BADGE: Record<string, { label: string; className: string }> = {
  sign_in: { label: 'Sign-in', className: 'bg-secondary text-muted-foreground' },
  sign_out: { label: 'Sign-out', className: 'bg-secondary text-muted-foreground' },
  sign_in_blocked: { label: 'Sign-in blocked', className: 'bg-danger-soft text-danger' },
  access_denied: { label: 'Access denied', className: 'bg-danger-soft text-danger' },
  create: { label: 'Create', className: 'bg-success-soft text-success-strong' },
  update: { label: 'Update', className: 'bg-secondary text-foreground' },
  delete: { label: 'Delete', className: 'bg-danger-soft text-danger' },
  view_sensitive: { label: 'View sensitive', className: 'bg-secondary text-muted-foreground' },
  role_change: { label: 'Role change', className: 'bg-primary text-white' },
  status_change: { label: 'Status change', className: 'bg-secondary text-muted-foreground' },
  screen_access_change: { label: 'Screen access', className: 'bg-secondary text-primary' },
}

function ActionBadge({ action }: { action: string }) {
  const badge = ACTION_BADGE[action] ?? { label: action.replace(/_/g, ' '), className: 'bg-secondary text-muted-foreground' }
  return <Badge className={cn('px-2.5', badge.className)}>{badge.label}</Badge>
}

/** Who did it: the person's name when the API knows it, then the role line under it. */
function actorLines(e: AuditEntry): { name: string; role: string } {
  if (e.actor_type === 'system') return { name: 'System', role: e.actor_role_name ?? 'Scheduled job' }
  const name = e.actor_name ?? e.actor_id ?? 'Unknown user'
  const role = e.actor_role_name ?? (e.actor_type === 'customer' ? 'Customer' : (e.actor_role ?? 'Staff'))
  return { name, role }
}

/** A before/after payload as `key: value` lines; `null` for a sensitive row. */
function valueLines(v: unknown): string[] | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object') return [String(v)]
  return Object.entries(v as Record<string, unknown>).map(
    ([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`,
  )
}

/** Radix `Select` items cannot have an empty value, so "no filter" gets its own sentinel. */
const ALL = '__all__'

/** A labelled filter: a shadcn Select with an "all" row. */
function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
  className,
}: {
  label: string
  value: string | undefined
  allLabel: string
  options: { value: string; label: string }[]
  onChange: (value: string | undefined) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80 border-border font-sans">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/* Component ------------------------------------------------------------- */

/** Read the HTTP status the API wrapper puts first in a thrown message (`403 Forbidden: …`). Anchored, so a number later in the text is never mistaken for a status. */
function statusFromError(msg: string): number | undefined {
  const m = /^\s*(\d{3})\b/.exec(msg)
  if (!m) return undefined
  const n = Number(m[1])
  return n >= 100 && n < 600 ? n : undefined
}

/** Before / after boxes plus the entry's meta line, shown under an open row and in the linked-entry panel. */
function EntryDetail({ e }: { e: AuditEntry }): ReactNode {
  const before = valueLines(e.before)
  const after = valueLines(e.after)
  const box = (label: string, lines: string[] | null) => (
    <Card className="min-w-0 py-3.5">
      <CardContent className="px-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase">{label}</p>
        <div className="mt-1 text-sm text-foreground">
          {lines === null ? (
            <span className="text-muted-foreground">{e.is_sensitive ? 'Hidden — sensitive data' : '—'}</span>
          ) : lines.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            lines.map((l) => (
              <p key={l} className="break-words">
                {l}
              </p>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 max-tablet:grid-cols-1">
        {box('Before', before)}
        {box('After', after)}
      </div>
      {e.reason && (
        <p className="text-sm text-foreground">
          <span className="font-semibold">Reason:</span> {e.reason}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Entry #{e.seq} · Happened {formatTime(e.occurred_at)} · Recorded {formatTime(e.recorded_at)} · {e.entity_type ?? 'entity'}
        {e.entity_id ? ` ${e.entity_id}` : ''} · Read only
      </p>
    </div>
  )
}

interface LinkedEntryState {
  id: string | null
  loading: boolean
  entry: AuditEntry | null
  notFound: boolean
}

/**
 * Audit log page. Both access gates live in `routes/_authenticated/admin/route.tsx`, one level up: it owns
 * `RequireStaff` (one `GET /api/me/screens` for all three tabs). Do not add another gate in here.
 *
 * The open row lives in the URL — `/admin/audit-log/$auditId`, the spec's deep link — so an entry can be linked to and
 * closed with Back. The list is paginated, so a linked entry is often not on the page in view; it is then fetched on
 * its own (`GET /api/admin/audit-log/:id`) and shown in a panel above the table. An id that does not exist falls back
 * to the list with a "not found" banner.
 */
export function AuditLogPage() {
  const listAudit = useListAudit()
  const getAuditEntry = useGetAuditEntry()
  const navigate = useNavigate()
  const { auditId } = useParams({ strict: false })

  const [filters, setFilters] = useState<AuditFilters>({
    source_feature: undefined,
    actor_type: undefined,
    action: undefined,
    from: undefined,
    to: undefined,
  })
  const [limit, setLimit] = useState(25)
  /* The open entry's id, from the URL. */
  const expanded = auditId ?? null
  const [notFoundId, setNotFoundId] = useState<string | null>(null)
  /* Only read below the 768px breakpoint, where the filter fields collapse behind a toggle. Desktop always shows
     them, so this staying false there costs nothing. */
  const [filtersOpen, setFiltersOpen] = useState(false)

  const liveHook = useAuditLog(filters, limit, async (q) => {
    const res = await listAudit(q)
    return res
  })
  const page: AuditPage | null = liveHook.page
  const loading = liveHook.loading
  const error = liveHook.error

  /* Linked entry that is not on the page in view. Wait for the page first, so an entry that is on it simply opens in
     place. `linked.id` tracks which id the state belongs to; a new id resets it while rendering (no setState in an
     effect body). */
  const onPage = !!expanded && !!page?.items.some((e) => e.id === expanded)
  const needsFetch = !!expanded && !onPage && !loading && !!page
  const [linked, setLinked] = useState<LinkedEntryState>({ id: null, loading: false, entry: null, notFound: false })
  if (needsFetch && linked.id !== expanded) {
    setLinked({ id: expanded, loading: true, entry: null, notFound: false })
  }
  useEffect(() => {
    if (!needsFetch || !expanded) return
    let cancelled = false
    ;(async () => {
      try {
        const entry = await getAuditEntry(expanded)
        if (cancelled) return
        setLinked({ id: expanded, loading: false, entry, notFound: entry === null })
      } catch (e: unknown) {
        if (cancelled) return
        // 404 (no such entry) or 400 (not a valid id) both mean the link is wrong; anything else is a real failure
        // and is shown as one rather than as "not found".
        const status = statusFromError(e instanceof Error ? e.message : String(e))
        setLinked({ id: expanded, loading: false, entry: null, notFound: status === 404 || status === 400 })
      }
    })()
    return () => {
      cancelled = true
    }
    // `getAuditEntry` closes over `fetchWithAuth`, recreated every render; see `useFetchJson`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFetch, expanded])

  /* A wrong link: remember it for the banner and send the URL back to the list. */
  const linkIsBad = !!expanded && linked.id === expanded && !linked.loading && linked.notFound
  if (linkIsBad && notFoundId !== expanded) setNotFoundId(expanded)
  useEffect(() => {
    if (linkIsBad) void navigate({ to: '/admin/audit-log', search: true, replace: true })
  }, [linkIsBad, navigate])

  function openEntry(id: string | null) {
    setNotFoundId(null)
    if (id) void navigate({ to: '/admin/audit-log/$auditId', params: { auditId: id }, search: true })
    else void navigate({ to: '/admin/audit-log', search: true })
  }

  function clear() {
    setFilters({
      source_feature: undefined,
      actor_type: undefined,
      action: undefined,
      from: undefined,
      to: undefined,
    })
  }

  /* One-line description of what is narrowing the log, for the mobile chip. Unset filters are summarised as
     "All features" so the chip always reads as a sentence rather than as an empty pill. */
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const hasFilters = activeFilterCount > 0
  const filterSummary = useMemo(() => {
    const parts: string[] = []
    if (filters.source_feature) parts.push(`F${filters.source_feature}`)
    if (filters.actor_type) parts.push(filters.actor_type)
    if (filters.action) parts.push(filters.action.replace(/_/g, ' '))
    if (filters.from || filters.to) parts.push(`${shortDate(filters.from)}–${shortDate(filters.to)}`)
    return parts.length ? parts.join(' · ') : 'All features'
  }, [filters])

  /** The columns: time 134, actor 204, feature 169, action 130, target 103, details rest — from the 950px table. */
  const GRID = 'grid grid-cols-6 items-center'

  function renderRow(e: AuditEntry) {
    const isOpen = expanded === e.id
    const actor = actorLines(e)
    const target = e.entity_id ?? e.entity_type ?? '—'
    return (
      <li key={e.seq} className="border-b border-border max-tablet:mb-2.5 max-tablet:rounded-xl max-tablet:border max-tablet:bg-background">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={`${formatTime(e.occurred_at ?? e.recorded_at)}, ${actor.name}, ${featureName(e.source_feature)}, ${ACTION_BADGE[e.action]?.label ?? e.action}, ${target}. ${e.summary ?? ''}`}
          className={cn(
            'w-full text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent',
            GRID,
            'min-h-14.5 py-2 max-tablet:flex max-tablet:min-h-0 max-tablet:flex-col max-tablet:items-stretch max-tablet:gap-1.5 max-tablet:rounded-xl max-tablet:p-3',
            isOpen && 'bg-accent',
          )}
          onClick={() => openEntry(isOpen ? null : e.id)}
        >
          {/* Desktop: one grid row. Phone: time + badge, then who, where and what — the card in the mobile frames. */}
          <span className="flex items-center gap-1.5 max-tablet:justify-between">
            <span className="flex items-center gap-1.5">
              {isOpen ? (
                <ChevronDown className="size-3 text-foreground max-tablet:hidden" strokeWidth={3} aria-hidden="true" />
              ) : (
                <ChevronRight className="size-3 text-foreground max-tablet:hidden" strokeWidth={3} aria-hidden="true" />
              )}
              <span className="text-sm tabular-nums max-tablet:text-sm">{formatTime(e.occurred_at ?? e.recorded_at)}</span>
            </span>
            <span className="hidden max-tablet:inline">
              <ActionBadge action={e.action} />
            </span>
          </span>
          <span className="min-w-0 pr-3">
            <span className="block truncate text-sm font-semibold max-tablet:text-sm">{actor.name}</span>
            <span className="block truncate text-xs text-muted-foreground max-tablet:hidden">{actor.role}</span>
          </span>
          <span className="truncate pr-3 max-tablet:text-xs max-tablet:text-muted-foreground">{featureName(e.source_feature)}</span>
          <span className="max-tablet:hidden">
            <ActionBadge action={e.action} />
          </span>
          <span className="truncate pr-3 font-mono text-xs max-tablet:hidden" title={target}>
            {target}
          </span>
          <span className="line-clamp-2 break-words max-tablet:text-sm">{e.summary ?? '—'}</span>
        </button>
        {isOpen && (
          <div className="px-3.5 pt-1 pb-4 max-tablet:px-3">
            <EntryDetail e={e} />
          </div>
        )}
      </li>
    )
  }

  /* A user with no staff row never reaches this point — the layout route answers that case first. */

  if (error) {
    /* A non-admin reaching the audit log is the common case during rollout, and the setup checklist inside
       AdminErrorCard is noise for them — they are not misconfigured, they simply lack the screen. */
    if (statusFromError(error) === 403) {
      return <NoAccessScreen screenName="Audit log" homeTo="/admin/roles" />
    }
    return <AdminErrorCard page="Audit log" error={error} status={statusFromError(error)} onRetry={liveHook.reload} />
  }

  const hasPrev = liveHook.hasPrev
  const nextPage = () => {
    liveHook.nextPage()
  }
  const prevPage = () => {
    liveHook.prevPage()
  }

  /* Cursor pagination has no total-count endpoint, so the footer reports the range it can actually prove and marks
     an open end with "+" rather than inventing a number. */
  const pageSize = page?.items.length ?? 0
  const hasMore = page?.has_more ?? false
  const rowsBefore = liveHook.rowsBefore
  const pageIndex = liveHook.pageIndex

  return (
    <>
      <Card className="font-sans">
        <CardHeader>
          <CardTitle className="text-lg">Audit log</CardTitle>
          <CardDescription>
            Every sign-in, sign-out, change and sensitive-data view across all actors and features. Newest first.
          </CardDescription>
          <CardAction aria-live="polite">{loading && <Badge variant="outline">Loading…</Badge>}</CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-4">
            <p className="hidden text-xs text-muted-foreground max-tablet:block">Tap a row to see before and after values.</p>

            {/* Filters ---------------------------------------------------- */}
            {/* At ≤768px the fields collapse behind this button — a phone has no width for them — and the label says
                what is currently narrowing the log. */}
            <Button
              type="button"
              variant="outline"
              className="hidden w-full max-tablet:inline-flex"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal aria-hidden="true" />
              Filters · {filterSummary}
            </Button>
            <div
              className={cn(
                'grid grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end gap-3 max-laptop:grid-cols-3 max-tablet:grid-cols-1 max-tablet:rounded-xl max-tablet:border max-tablet:p-3',
                !filtersOpen && 'max-tablet:hidden',
              )}
            >
              <FilterSelect
                label="Feature"
                value={filters.source_feature}
                allLabel="All features"
                options={FEATURE_NUMBERS.map((n) => ({ value: n, label: featureName(n) }))}
                onChange={(v) => setFilters((f) => ({ ...f, source_feature: v }))}
              />
              <FilterSelect
                label="Actor"
                value={filters.actor_type}
                allLabel="All actors"
                options={ACTOR_TYPES.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))}
                onChange={(v) => setFilters((f) => ({ ...f, actor_type: v as AuditFilters['actor_type'] }))}
              />
              <FilterSelect
                label="Action type"
                value={filters.action}
                allLabel="All actions"
                options={ACTION_TYPES.map((a) => ({ value: a, label: ACTION_BADGE[a]?.label ?? a }))}
                onChange={(v) => setFilters((f) => ({ ...f, action: v as ActionType | undefined }))}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="audit-from"
                  type="date"
                  value={filters.from ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="audit-to"
                  type="date"
                  value={filters.to ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                className="justify-self-end max-laptop:col-span-3 max-tablet:col-span-1 max-tablet:justify-self-stretch"
                disabled={!hasFilters}
                onClick={clear}
              >
                <X aria-hidden="true" />
                Clear filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
              </Button>
            </div>
          </div>

          {notFoundId && !expanded && (
            <Alert variant="destructive" className="mt-4 border-danger-line/40 bg-danger-soft">
              <CircleAlert aria-hidden="true" />
              <AlertDescription className="text-current">
                Audit entry not found. The link may be old, or the entry ID is wrong. Showing the latest entries instead.
              </AlertDescription>
            </Alert>
          )}

          {/* Linked entry that is not on the page in view -------------- */}
          {expanded && !onPage && linked.id === expanded && (linked.loading || linked.entry) && (
            <Card className="mt-4 border-gold/60 bg-accent py-3" aria-live="polite">
              <CardContent className="px-4">
                <div className="mb-3 flex items-center justify-between gap-3 text-sm text-foreground">
                  <span className="flex flex-wrap items-center gap-2">
                    {linked.entry ? (
                      <>
                        <span className="font-semibold">Linked entry #{linked.entry.seq}</span>
                        <ActionBadge action={linked.entry.action} />
                        <span>{linked.entry.summary}</span>
                      </>
                    ) : (
                      'Loading linked entry…'
                    )}
                  </span>
                  <Button type="button" variant="outline" className="" onClick={() => openEntry(null)}>
                    Close
                  </Button>
                </div>
                {linked.entry && <EntryDetail e={linked.entry} />}
              </CardContent>
            </Card>
          )}

          {/* Table --------------------------------------------------- */}
          {/* The six columns need ~860px; on a narrow desktop window the table scrolls sideways inside the card instead of
            pushing the whole page wider. Phones get the card layout instead. */}
          <div className="mt-4 overflow-x-auto max-tablet:mt-3 max-tablet:overflow-visible">
            <div className="min-w-215 max-tablet:min-w-0">
              <div
                className={cn(GRID, 'border-b border-border pb-3 text-xs font-semibold text-muted-foreground uppercase max-tablet:hidden')}
                aria-hidden="true"
              >
                <span>Time</span>
                <span>Actor / Role</span>
                <span>Feature</span>
                <span>Action</span>
                <span>Target</span>
                <span>Details</span>
              </div>
              {page && page.items.length > 0 ? (
                <ul>{page.items.map(renderRow)}</ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground" role="status">
                  {loading
                    ? 'Loading…'
                    : hasFilters
                      ? 'No audit entries match these filters. Clear a filter to widen the search.'
                      : 'No audit entries yet.'}
                </p>
              )}
            </div>
          </div>

          {/* Pagination ---------------------------------------------- */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-foreground max-tablet:flex-col max-tablet:items-start">
            <span>
              {pageSize === 0
                ? 'No entries'
                : `Showing ${rowsBefore + 1}–${rowsBefore + pageSize} of ${hasMore ? `${rowsBefore + pageSize}+` : rowsBefore + pageSize} entries`}
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-2.5">
                Rows
                <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                  <SelectTrigger className="w-18.5 border-border bg-background px-3 text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="font-sans">
                    {[25, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button type="button" variant="outline" className="px-4 font-medium" disabled={!hasPrev} onClick={() => prevPage()}>
                Previous
              </Button>
              <span className="whitespace-nowrap">
                Page {pageIndex + 1} of {hasMore ? `${pageIndex + 1}+` : pageIndex + 1}
              </span>
              <Button type="button" variant="outline" className="px-4 font-medium" disabled={!hasMore} onClick={() => nextPage()}>
                Next
              </Button>
            </div>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            Read only. Entries can’t be edited or deleted. Times follow the system’s simulation clock, not your local time.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
