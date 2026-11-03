import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
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
  sign_out: { label: 'Sign-out', className: 'bg-[#fbf1e4] text-[#8a5a14]' },
  sign_in_blocked: { label: 'Sign-in blocked', className: 'bg-danger-soft text-[#d1343b]' },
  access_denied: { label: 'Access denied', className: 'bg-danger-soft text-danger' },
  create: { label: 'Create', className: 'bg-success-soft text-success-strong' },
  update: { label: 'Update', className: 'bg-warning-soft text-warning' },
  delete: { label: 'Delete', className: 'bg-danger-soft text-[#d1343b]' },
  view_sensitive: { label: 'View sensitive', className: 'bg-secondary text-muted-foreground' },
  role_change: { label: 'Role change', className: 'bg-primary text-white' },
  status_change: { label: 'Status change', className: 'bg-secondary text-[#455473]' },
  screen_access_change: { label: 'Screen access', className: 'bg-[#e6eefb] text-[#1e3a8a]' },
}

function ActionBadge({ action }: { action: string }) {
  const badge = ACTION_BADGE[action] ?? { label: action.replace(/_/g, ' '), className: 'bg-secondary text-muted-foreground' }
  return (
    <span
      className={cn('inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap', badge.className)}
    >
      {badge.label}
    </span>
  )
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

const FIELD =
  'h-12 w-full rounded-[9px] border-[#d9dfe9] bg-white px-3.5 text-[15px] text-ink shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 data-[size=default]:h-12 md:text-[15px] [&_svg:not([class*=text-])]:text-muted-foreground'
const BTN_OUTLINE = 'rounded-[9px] border-[#d9dfe9] bg-white font-semibold text-ink shadow-none hover:bg-accent'

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
  return (
    <div className={cn('flex flex-col gap-[3px]', className)}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger className={FIELD} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80 rounded-xl border-[#d9dfe9] font-sans leading-[normal]">
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

/** Look for a numeric HTTP status in a thrown error message. */
function statusFromError(msg: string): number | undefined {
  const m = /(\b\d{3}\b)/.exec(msg)
  if (!m) return undefined
  const n = Number(m[1])
  return n >= 100 && n < 600 ? n : undefined
}

/** Before / after boxes plus the entry's meta line, shown under an open row and in the linked-entry panel. */
function EntryDetail({ e }: { e: AuditEntry }): ReactNode {
  const before = valueLines(e.before)
  const after = valueLines(e.after)
  const box = (label: string, lines: string[] | null) => (
    <div className="min-w-0 rounded-[10px] border border-[#d9dfe9] bg-white px-4 py-[15px]">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase">{label}</p>
      <div className="mt-[5px] text-sm text-ink">
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
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-[13px] max-tablet:grid-cols-1">
        {box('Before', before)}
        {box('After', after)}
      </div>
      {e.reason && (
        <p className="text-sm text-ink">
          <span className="font-semibold">Reason:</span> {e.reason}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Entry #{e.seq} · Sim time {formatTime(e.occurred_at)} · Saved {formatTime(e.recorded_at)} · {e.entity_type ?? 'entity'}
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

  /* Best-effort action inventory across the rows currently loaded — "best-effort" because the endpoint is
   * cursor-paginated, so this counts the page in view, not the whole log. */
  const summary = useMemo(() => {
    if (!page) return { entries: 0, actionTypes: 0 }
    const a = new Set<string>()
    for (const e of page.items) a.add(e.action)
    return { entries: page.items.length, actionTypes: a.size }
  }, [page])

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
  const filterSummary = useMemo(() => {
    const parts: string[] = []
    if (filters.source_feature) parts.push(`F${filters.source_feature}`)
    if (filters.actor_type) parts.push(filters.actor_type)
    if (filters.action) parts.push(filters.action.replace(/_/g, ' '))
    if (filters.from || filters.to) parts.push(`${shortDate(filters.from)}–${shortDate(filters.to)}`)
    return parts.length ? parts.join(' · ') : 'All features'
  }, [filters])

  /** The columns: time 134, actor 204, feature 169, action 130, target 103, details rest — from the 950px table. */
  const GRID = 'grid grid-cols-[134px_204px_169px_130px_103px_minmax(0,1fr)] items-center'

  function renderRow(e: AuditEntry) {
    const isOpen = expanded === e.id
    const actor = actorLines(e)
    const target = e.entity_id ?? e.entity_type ?? '—'
    return (
      <li key={e.seq} className="border-b border-[#d9dfe9] max-tablet:mb-2.5 max-tablet:rounded-xl max-tablet:border max-tablet:bg-white">
        <button
          type="button"
          aria-expanded={isOpen}
          className={cn(
            'w-full text-left text-[13px] text-ink outline-none hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc]',
            GRID,
            'min-h-[58px] py-2 max-tablet:flex max-tablet:min-h-0 max-tablet:flex-col max-tablet:items-stretch max-tablet:gap-1.5 max-tablet:rounded-xl max-tablet:p-[13px]',
            isOpen && 'bg-[#f7f9fc]',
          )}
          onClick={() => openEntry(isOpen ? null : e.id)}
        >
          {/* Desktop: one grid row. Phone: time + badge, then who, where and what — the card in the mobile frames. */}
          <span className="flex items-center gap-1.5 max-tablet:justify-between">
            <span className="flex items-center gap-1.5">
              {isOpen ? (
                <ChevronDown className="size-3 text-ink max-tablet:hidden" strokeWidth={3} aria-hidden="true" />
              ) : (
                <ChevronRight className="size-3 text-ink max-tablet:hidden" strokeWidth={3} aria-hidden="true" />
              )}
              <span className="text-[13px] max-tablet:text-sm">{formatTime(e.occurred_at ?? e.recorded_at)}</span>
            </span>
            <span className="hidden max-tablet:inline">
              <ActionBadge action={e.action} />
            </span>
          </span>
          <span className="min-w-0 pr-3">
            <span className="block truncate text-sm font-semibold max-tablet:text-[15px]">{actor.name}</span>
            <span className="block truncate text-xs text-muted-foreground max-tablet:hidden">{actor.role}</span>
          </span>
          <span className="truncate pr-3 max-tablet:text-xs max-tablet:text-muted-foreground">{featureName(e.source_feature)}</span>
          <span className="max-tablet:hidden">
            <ActionBadge action={e.action} />
          </span>
          <span className="truncate pr-3 max-tablet:hidden">{target}</span>
          <span className="line-clamp-2 break-words max-tablet:text-sm">{e.summary ?? '—'}</span>
        </button>
        {isOpen && (
          <div className="px-3.5 pt-1 pb-4 max-tablet:px-[13px]">
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
    return <AdminErrorCard page="Audit log" error={error} status={statusFromError(error)} onRetry={() => window.location.reload()} />
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
      <Card className="gap-0 rounded-[14px] border-[#d9dfe9] bg-white px-[27px] pt-[27px] pb-6 font-sans leading-[normal] text-ink shadow-none max-tablet:px-[15px] max-tablet:pt-[15px]">
        <h2 className="m-0 font-sans text-xl leading-[normal] font-bold tracking-[-1px] text-ink max-tablet:text-[20px]">Audit log</h2>
        <p className="mt-2 text-sm text-muted-foreground max-tablet:text-xs">
          Every sign-in, sign-out, change and sensitive-data view across all actors and features. Newest first (by entry #).
        </p>

        {/* Filters ------------------------------------------------------ */}
        {/* At ≤768px the five fields collapse behind this button — a phone has no width for them — and the chip says
            what is currently narrowing the log. */}
        <div className="mt-3 hidden items-center gap-2.5 max-tablet:flex">
          <Button
            type="button"
            variant="outline"
            className={cn(BTN_OUTLINE, 'h-[43px] flex-1 gap-2 text-sm')}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filters · {filterSummary}
          </Button>
        </div>
        <div
          className={cn(
            'mt-[23px] flex flex-wrap items-end gap-2.5',
            'max-tablet:mt-3 max-tablet:flex-col max-tablet:items-stretch max-tablet:rounded-xl max-tablet:border max-tablet:border-[#d9dfe9] max-tablet:p-3',
            !filtersOpen && 'max-tablet:hidden',
          )}
        >
          <FilterSelect
            className="min-w-[130px] flex-[162_1_0] max-tablet:w-full"
            label="Feature"
            value={filters.source_feature}
            allLabel="All features"
            options={FEATURE_NUMBERS.map((n) => ({ value: n, label: featureName(n) }))}
            onChange={(v) => setFilters((f) => ({ ...f, source_feature: v }))}
          />
          <FilterSelect
            className="min-w-[130px] flex-[190_1_0] max-tablet:w-full"
            label="Actor"
            value={filters.actor_type}
            allLabel="All actors"
            options={ACTOR_TYPES.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))}
            onChange={(v) => setFilters((f) => ({ ...f, actor_type: v as AuditFilters['actor_type'] }))}
          />
          <FilterSelect
            className="min-w-[130px] flex-[190_1_0] max-tablet:w-full"
            label="Action type"
            value={filters.action}
            allLabel="All actions"
            options={ACTION_TYPES.map((a) => ({ value: a, label: ACTION_BADGE[a]?.label ?? a }))}
            onChange={(v) => setFilters((f) => ({ ...f, action: v as ActionType | undefined }))}
          />
          <label className="flex min-w-[140px] flex-[160_1_0] flex-col gap-[3px] max-tablet:w-full">
            <span className="text-xs font-semibold text-muted-foreground">From</span>
            <Input
              type="date"
              className={FIELD}
              value={filters.from ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
            />
          </label>
          <label className="flex min-w-[130px] flex-[130_1_0] flex-col gap-[3px] max-tablet:w-full">
            <span className="text-xs font-semibold text-muted-foreground">To</span>
            <Input
              type="date"
              className={cn(FIELD, 'px-2.5')}
              value={filters.to ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className={cn(BTN_OUTLINE, 'mb-[3px] h-[42px] shrink-0 px-2.5 text-[13px] max-tablet:mb-0')}
            onClick={clear}
          >
            Clear filters
          </Button>
        </div>

        {/* Summary line --------------------------------------------- */}
        <div className="mt-[26px] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground max-tablet:mt-3 max-tablet:text-xs">
          <span>
            {summary.entries} entries · {summary.actionTypes} action types
            {loading ? ' · loading…' : ''}
          </span>
          <span className="max-tablet:hidden">
            {summary.actionTypes >= ACTION_TYPES.length
              ? `All ${ACTION_TYPES.length} audit action types are represented.`
              : `${summary.actionTypes} of ${ACTION_TYPES.length} audit action types are represented.`}
          </span>
        </div>
        <p className="mt-2 hidden text-xs text-muted-foreground max-tablet:block">Tap a row to see before and after values.</p>

        {notFoundId && !expanded && (
          <div className="mt-4 rounded-[9px] bg-danger-soft px-[22px] py-3 text-sm text-danger" role="alert">
            Audit entry not found. The link may be old, or the entry ID is wrong. Showing the latest entries instead.
          </div>
        )}

        {/* Linked entry that is not on the page in view -------------- */}
        {expanded && !onPage && linked.id === expanded && (linked.loading || linked.entry) && (
          <div
            className="mt-4 rounded-[10px] border border-[#d9dfe9] border-l-[3px] border-l-gold bg-[#fafbfd] px-4 py-3"
            aria-live="polite"
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-ink">
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
              <Button type="button" variant="outline" className={cn(BTN_OUTLINE, 'h-9 text-[13px]')} onClick={() => openEntry(null)}>
                Close
              </Button>
            </div>
            {linked.entry && <EntryDetail e={linked.entry} />}
          </div>
        )}

        {/* Table --------------------------------------------------- */}
        {/* The six columns need ~860px; on a narrow desktop window the table scrolls sideways inside the card instead of
            pushing the whole page wider. Phones get the card layout instead. */}
        <div className="mt-[18px] overflow-x-auto max-tablet:mt-3 max-tablet:overflow-visible">
          <div className="min-w-[860px] max-tablet:min-w-0">
            <div
              className={cn(
                GRID,
                'border-b border-[#d9dfe9] pb-3 text-[11px] font-semibold text-muted-foreground uppercase max-tablet:hidden',
              )}
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                {loading ? 'Loading…' : 'No audit entries match these filters.'}
              </p>
            )}
          </div>
        </div>

        {/* Pagination ---------------------------------------------- */}
        <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink max-tablet:flex-col max-tablet:items-start">
          <span>
            {pageSize === 0
              ? 'No entries'
              : `Showing ${rowsBefore + 1}–${rowsBefore + pageSize} of ${hasMore ? `${rowsBefore + pageSize}+` : rowsBefore + pageSize} entries`}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2.5">
              Rows
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="h-[38px] w-[74px] rounded-lg border-[#d9dfe9] bg-white px-3 text-[13px] text-ink shadow-none data-[size=default]:h-[38px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="font-sans leading-[normal]">
                  {[25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              type="button"
              variant="outline"
              className={cn(BTN_OUTLINE, 'h-[35px] rounded-lg px-4 text-[13px] font-medium')}
              disabled={!hasPrev}
              onClick={() => prevPage()}
            >
              Previous
            </Button>
            <span className="whitespace-nowrap">
              Page {pageIndex + 1} of {hasMore ? `${pageIndex + 1}+` : pageIndex + 1}
            </span>
            <Button
              type="button"
              variant="outline"
              className={cn(BTN_OUTLINE, 'h-[35px] rounded-lg px-4 text-[13px] font-medium')}
              disabled={!hasMore}
              onClick={() => nextPage()}
            >
              Next
            </Button>
          </div>
        </div>

        <p className="mt-3 text-[13px] text-muted-foreground">
          Read only. Entries can’t be edited or deleted. Times use the simulation clock.
        </p>
      </Card>
    </>
  )
}
