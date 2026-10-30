import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { useGetAuditEntry, useListAudit } from '../api/audit'
import { useAuditLog } from '../hooks/useAuditLog'
import { FEATURE_NUMBERS, featureLabel } from '../feature-labels'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { NoAccessScreen } from '../components/NoAccessScreen'
import { PAGE_CARD } from '../page-card'
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/** `2026-10-10` → `10 Oct`. Date-only, so a plain string split avoids the timezone shift `new Date()` introduces. */
function shortDate(iso: string | undefined): string {
  if (!iso) return '…'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`
}

function actionClass(action: string): string {
  if (action === 'create') return 'bg-[#e5f3e8] text-[#166534]'
  if (action === 'delete') return 'bg-[#fbe6e6] text-[#991b1b]'
  if (action === 'update') return 'bg-[#fff1d6] text-[#92400e]'
  return 'bg-[#e6eefb] text-[#1e3a8a]'
}

function ActionPill({ action }: { action: string }) {
  return (
    <Badge className={cn('rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.04em] uppercase', actionClass(action))}>
      {action.replace(/_/g, ' ')}
    </Badge>
  )
}

/** Radix `Select` items cannot have an empty value, so "no filter" gets its own sentinel. */
const ALL = '__all__'

const CONTROL =
  'h-[37px] w-full min-w-[150px] rounded-md border-[#d1d5db] bg-white px-3 text-sm text-[#111827] shadow-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/10 data-[size=default]:h-[37px] md:text-sm'
const BTN_GHOST =
  'h-[33px] rounded-lg border-[#d1d5db] bg-white px-3.5 text-[13px] font-normal text-[#374151] shadow-none hover:bg-[#f3f4f6]'

/** A labelled filter control. `select` is a shadcn Select with an "all" row; anything else is passed through. */
function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  allLabel: string
  options: { value: string; label: string }[]
  onChange: (value: string | undefined) => void
}) {
  return (
    <div className="flex flex-none flex-col gap-1 max-tablet:w-full">
      <span className="text-[11px] text-[#6b7280]">{label}</span>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger className={CONTROL} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80 font-sans leading-[normal]">
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

/** The 4 detail blocks shown under an open row, and in the linked-entry panel. */
function EntryDetail({ e }: { e: AuditEntry }): ReactNode {
  return (
    <div className="grid grid-cols-2 gap-4 text-xs text-[#6b7280] max-tablet:grid-cols-1 [&_h5]:mb-1 [&_h5]:text-[11px] [&_h5]:font-semibold [&_h5]:tracking-[0.06em] [&_h5]:uppercase">
      <div>
        <h5>Before</h5>
        <pre className="max-h-40 overflow-auto rounded-sm border border-line bg-white px-3 py-2 font-mono text-xs">
          {e.before ? JSON.stringify(e.before, null, 2) : '(sensitive — hidden)'}
        </pre>
      </div>
      <div>
        <h5>After</h5>
        <pre className="max-h-40 overflow-auto rounded-sm border border-line bg-white px-3 py-2 font-mono text-xs">
          {e.after ? JSON.stringify(e.after, null, 2) : '(sensitive — hidden)'}
        </pre>
      </div>
      <div>
        <h5>Reason</h5>
        <p className="rounded-sm border border-line bg-[#fff8e8] px-3 py-2">{e.reason ?? '—'}</p>
      </div>
      <div>
        <h5>Meta</h5>
        <p className="leading-[26px]">
          #{e.seq} · Sim {formatDate(e.occurred_at)} · Saved {formatDate(e.recorded_at)} · staff-web · Read only
        </p>
      </div>
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

  function renderRow(e: AuditEntry) {
    const isOpen = expanded === e.id
    return (
      // Each cell names its role so the ≤768px card layout can reorder and restyle it; nth-child would break the moment
      // a column is added or moved.
      <TableRow
        key={e.seq}
        data-state={isOpen ? 'selected' : undefined}
        className={cn(
          'cursor-pointer border-[#f1f2f6] hover:bg-[#f9fafb] data-[state=selected]:bg-[#f3f4f6]',
          'max-tablet:mb-2.5 max-tablet:flex max-tablet:flex-wrap max-tablet:items-center max-tablet:justify-between max-tablet:gap-x-3 max-tablet:gap-y-1 max-tablet:rounded-lg max-tablet:border max-tablet:border-line max-tablet:bg-white max-tablet:px-3.5 max-tablet:py-3 max-tablet:hover:bg-white max-tablet:data-[state=selected]:border-ink max-tablet:data-[state=selected]:bg-white',
        )}
        onClick={() => openEntry(isOpen ? null : e.id)}
      >
        <TableCell className="font-mono text-xs text-[#4b5563] max-tablet:hidden!">#{e.seq}</TableCell>
        <TableCell className="max-tablet:order-3 max-tablet:mt-1 max-tablet:w-full max-tablet:text-sm max-tablet:font-semibold">
          <span className="font-medium text-[#111827]">{e.actor_id ?? '—'}</span>
          <span className="text-xs text-[#6b7280]">
            {' '}
            · {e.actor_type}
            {e.actor_role ? ` (${e.actor_role})` : ''}
          </span>
        </TableCell>
        <TableCell className="max-tablet:order-4 max-tablet:w-full max-tablet:text-xs max-tablet:text-[#6b7280]">
          F{String(e.source_feature).padStart(2, '0')}
        </TableCell>
        <TableCell className="max-tablet:order-2">
          <ActionPill action={e.action} />
        </TableCell>
        <TableCell className="font-mono text-xs text-[#4b5563] max-tablet:hidden!">
          {e.entity_type}#{e.entity_id}
        </TableCell>
        <TableCell className="w-full max-w-0 truncate whitespace-nowrap! max-tablet:order-5 max-tablet:max-w-none max-tablet:text-[13px] max-tablet:whitespace-normal!">
          {e.summary}
        </TableCell>
        <TableCell className="text-xs text-[#6b7280] max-tablet:order-1">{formatDate(e.occurred_at ?? e.recorded_at)}</TableCell>
      </TableRow>
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
    <Card className={PAGE_CARD}>
      <header className="mb-4">
        <h2 className="m-0 mb-1 font-heading text-xl font-semibold text-[#111827]">Audit log</h2>
      </header>

      {/* Filter row ----------------------------------------------- */}
      {/* At ≤768px the five fields collapse behind this toggle — a phone has no width to lay them out in — and the chip
          beside it says what is currently narrowing the log. */}
      <div className="mb-2.5 hidden items-center gap-2.5 max-tablet:flex">
        <Button
          type="button"
          variant="outline"
          className={cn(BTN_GHOST, 'gap-1.5 px-4 font-semibold')}
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Filters
        </Button>
        <span className="truncate rounded-full bg-[#eef1f8] px-3 py-[7px] text-xs text-[#6b7280]">{filterSummary}</span>
      </div>
      {/* Each control is a labelled stack so the five fields share one baseline, and the unlabelled "Clear filters"
          button lines up with the inputs rather than floating at the top of the row. */}
      <div
        className={cn(
          'mb-1 flex flex-wrap items-end gap-3',
          'max-tablet:flex-col max-tablet:items-stretch',
          !filtersOpen && 'max-tablet:hidden',
        )}
      >
        <FilterSelect
          label="Feature"
          value={filters.source_feature}
          allLabel="All features"
          options={FEATURE_NUMBERS.map((n) => ({ value: n, label: `F${n} · ${featureLabel(n)}` }))}
          onChange={(v) => setFilters((f) => ({ ...f, source_feature: v }))}
        />
        <FilterSelect
          label="Actor"
          value={filters.actor_type}
          allLabel="All actors"
          options={ACTOR_TYPES.map((a) => ({ value: a, label: a }))}
          onChange={(v) => setFilters((f) => ({ ...f, actor_type: v as AuditFilters['actor_type'] }))}
        />
        <FilterSelect
          label="Action type"
          value={filters.action}
          allLabel="All actions"
          options={ACTION_TYPES.map((a) => ({ value: a, label: a }))}
          onChange={(v) => setFilters((f) => ({ ...f, action: v as ActionType | undefined }))}
        />
        <label className="flex flex-none flex-col gap-1 max-tablet:w-full">
          <span className="text-[11px] text-[#6b7280]">From</span>
          <Input
            type="date"
            className={CONTROL}
            value={filters.from ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
          />
        </label>
        <label className="flex flex-none flex-col gap-1 max-tablet:w-full">
          <span className="text-[11px] text-[#6b7280]">To</span>
          <Input
            type="date"
            className={CONTROL}
            value={filters.to ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
          />
        </label>
        <Button type="button" variant="outline" className={cn(BTN_GHOST, 'h-[37px]')} onClick={clear}>
          Clear filters
        </Button>
      </div>

      {/* Summary line --------------------------------------------- */}
      <div className="mt-4 mb-3 flex flex-wrap items-baseline justify-between gap-4 text-[13px] text-[#6b7280]">
        <span>
          {summary.entries} entries · {summary.actionTypes} action types
          {loading ? ' · loading…' : ''}
        </span>
        <span>
          {summary.actionTypes >= ACTION_TYPES.length
            ? `All ${ACTION_TYPES.length} audit action types are represented.`
            : `${summary.actionTypes} of ${ACTION_TYPES.length} audit action types are represented.`}
        </span>
      </div>
      <p className="-mt-1 mb-2.5 hidden text-xs text-[#6b7280] max-tablet:block">Tap a row to see before and after values.</p>

      {notFoundId && !expanded && (
        <div className="mb-3 flex flex-wrap gap-x-1.5 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
          <strong className="font-semibold">Audit entry not found</strong>
          <span>The link may be old, or the entry ID is wrong. Showing the latest entries instead.</span>
        </div>
      )}

      {/* Linked entry that is not on the page in view -------------- */}
      {expanded && !onPage && linked.id === expanded && (linked.loading || linked.entry) && (
        <div className="mb-3 rounded-lg border border-line border-l-[3px] border-l-gold bg-[#fafbfd] px-3.5 py-3" aria-live="polite">
          <div className="mb-2.5 flex items-center justify-between gap-3 text-[13px] text-[#111827]">
            <span>
              {linked.entry ? (
                <>
                  Linked entry <span className="font-mono text-xs text-[#4b5563]">#{linked.entry.seq}</span> ·{' '}
                  <ActionPill action={linked.entry.action} /> {linked.entry.summary}
                </>
              ) : (
                'Loading linked entry…'
              )}
            </span>
            <Button type="button" variant="outline" className={BTN_GHOST} onClick={() => openEntry(null)}>
              Close
            </Button>
          </div>
          {linked.entry && <EntryDetail e={linked.entry} />}
        </div>
      )}

      {/* Table --------------------------------------------------- */}
      <div className="overflow-hidden rounded-lg border border-line bg-white max-tablet:overflow-visible max-tablet:border-0 max-tablet:bg-transparent">
        <Table className="min-w-[720px] text-[13px] max-tablet:block max-tablet:min-w-0 [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:leading-[26px] [&_td]:whitespace-normal max-tablet:[&_td]:block max-tablet:[&_td]:p-0">
          <TableHeader className="max-tablet:hidden">
            <TableRow className="border-[#f1f2f6] bg-[#f9fafb] hover:bg-[#f9fafb]">
              {['#', 'Actor / Role', 'Feature', 'Action', 'Target', 'Summary', 'Time (sim)'].map((h) => (
                <TableHead
                  key={h}
                  className="h-auto px-3.5 py-2.5 text-[11px] leading-[26px] font-medium tracking-[0.05em] text-[#6b7280] uppercase"
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="max-tablet:block">
            {page && page.items.length > 0 ? (
              page.items.flatMap((e) => {
                const rows = [renderRow(e)]
                if (expanded === e.id) {
                  rows.push(
                    <TableRow
                      key={`${e.seq}-detail`}
                      className="border-[#f1f2f6] bg-[#f9fafb] hover:bg-[#f9fafb] max-tablet:-mt-2.5 max-tablet:mb-2.5 max-tablet:block max-tablet:rounded-b-lg max-tablet:border max-tablet:border-t-0 max-tablet:border-ink"
                    >
                      <TableCell colSpan={7} className="whitespace-normal max-tablet:px-3.5! max-tablet:py-3!">
                        <EntryDetail e={e} />
                      </TableCell>
                    </TableRow>,
                  )
                }
                return rows
              })
            ) : (
              <TableRow className="hover:bg-transparent max-tablet:block">
                <TableCell colSpan={7} className="p-8! text-center text-[#6b7280]">
                  {loading ? 'Loading…' : 'No audit entries match these filters.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination ---------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 max-tablet:flex-col max-tablet:items-start max-tablet:gap-2.5">
        <span className="text-xs text-[#6b7280]">
          {pageSize === 0
            ? 'No entries'
            : `Showing ${rowsBefore + 1}–${rowsBefore + pageSize} of ${hasMore ? `${rowsBefore + pageSize}+` : rowsBefore + pageSize} entries`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.05em] text-[#374151] uppercase">
            Rows
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="h-11 min-w-[92px] rounded-lg border-[#d1d5db] bg-white px-4 text-[15px] font-medium text-[#111827] shadow-none data-[size=default]:h-11 [&_svg:not([class*='text-'])]:text-[#374151]">
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
            className="h-11 rounded-lg border-[#d1d5db] bg-white px-5 text-[15px] font-medium text-[#6b7280] shadow-none disabled:border-[#e5e7eb] disabled:bg-[#f8f9fb] disabled:text-[#9ca3af] disabled:opacity-100"
            disabled={!hasPrev}
            onClick={() => prevPage()}
          >
            Previous
          </Button>
          <span className="px-1 text-[15px] font-medium whitespace-nowrap text-[#111827]">
            Page {pageIndex + 1} of {hasMore ? `${pageIndex + 1}+` : pageIndex + 1}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg border-[#d1d5db] bg-white px-5 text-[15px] font-medium text-[#6b7280] shadow-none disabled:border-[#e5e7eb] disabled:bg-[#f8f9fb] disabled:text-[#9ca3af] disabled:opacity-100"
            disabled={!hasMore}
            onClick={() => nextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      <p className="mt-3 text-xs text-[#6b7280]">Read only. Entries can’t be edited or deleted. Times use the simulation clock.</p>
    </Card>
  )
}
