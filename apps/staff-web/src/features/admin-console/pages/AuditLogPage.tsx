import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useGetAuditEntry, useListAudit } from '../api/audit'
import { useAuditLog } from '../hooks/useAuditLog'
import { usePreviewMode } from '../hooks/usePreviewMode'
import { previewAudit } from '../preview-data'
import { FEATURE_NUMBERS, featureLabel } from '../feature-labels'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { NoAccessScreen } from '../components/NoAccessScreen'
import { AdminPreviewBanner } from '../components/AdminPreviewBanner'
import type { AuditEntry, AuditFilters, AuditPage } from '../types'
import './AuditLogPage.css'

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
  if (action === 'create') return 'a-green'
  if (action === 'delete') return 'a-red'
  if (action === 'update') return 'a-amber'
  return 'a-blue'
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
    <div className="detail-grid">
      <div>
        <h5>Before</h5>
        <pre className="muted small">{e.before ? JSON.stringify(e.before, null, 2) : '(sensitive — hidden)'}</pre>
      </div>
      <div>
        <h5>After</h5>
        <pre className="muted small">{e.after ? JSON.stringify(e.after, null, 2) : '(sensitive — hidden)'}</pre>
      </div>
      <div>
        <h5>Reason</h5>
        <p className="muted small detail-reason">{e.reason ?? '—'}</p>
      </div>
      <div>
        <h5>Meta</h5>
        <p className="muted small">
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
 * `RequireStaff` (one `GET /api/me/screens` for all three tabs) and the `?preview=1&denied=1` /
 * `?preview=1&unprovisioned=1` design-review flags. Do not add either back in here.
 *
 * The open row lives in the URL — `/admin/audit-log/$auditId`, the spec's deep link — so an entry can be linked to and
 * closed with Back. The list is paginated, so a linked entry is often not on the page in view; it is then fetched on
 * its own (`GET /api/admin/audit-log/:id`) and shown in a panel above the table. An id that does not exist falls back
 * to the list with a "not found" banner.
 */
export function AuditLogPage() {
  const isPreview = usePreviewMode()
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

  const liveHook = useAuditLog(
    filters,
    limit,
    async (q) => {
      const res = await listAudit(q)
      return res
    },
    !isPreview,
  )
  const livePage: AuditPage | null = liveHook.page
  const previewPage: AuditPage = previewAudit

  const page: AuditPage | null = isPreview ? previewPage : livePage
  const loading = !isPreview && liveHook.loading
  const error = !isPreview ? liveHook.error : null

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
        const entry = isPreview ? (previewAudit.items.find((e) => e.id === expanded) ?? null) : await getAuditEntry(expanded)
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
  }, [needsFetch, expanded, isPreview])

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
      // The `c-*` classes name each cell so the mobile card layout can reorder and restyle them; nth-child would
      // break the moment a column is added or moved.
      <tr key={e.seq} className={isOpen ? 'is-open' : ''} onClick={() => openEntry(isOpen ? null : e.id)}>
        <td className="c-seq mono small">#{e.seq}</td>
        <td className="c-actor">
          <span className="email">{e.actor_id ?? '—'}</span>
          <span className="muted small">
            {' '}
            · {e.actor_type}
            {e.actor_role ? ` (${e.actor_role})` : ''}
          </span>
        </td>
        <td className="c-feature">
          <span className="feature-tag">F{String(e.source_feature).padStart(2, '0')}</span>
        </td>
        <td className="c-action">
          <span className={`action-pill ${actionClass(e.action)}`}>{e.action.replace(/_/g, ' ')}</span>
        </td>
        <td className="c-target">
          <span className="mono small">
            {e.entity_type}#{e.entity_id}
          </span>
        </td>
        <td className="c-summary ellipsis">{e.summary}</td>
        <td className="c-time muted small">{formatDate(e.occurred_at ?? e.recorded_at)}</td>
      </tr>
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

  const hasPrev = !isPreview && liveHook.hasPrev
  const nextPage = () => {
    if (!isPreview) liveHook.nextPage()
  }
  const prevPage = () => {
    if (!isPreview) liveHook.prevPage()
  }

  /* Cursor pagination has no total-count endpoint, so the footer reports the range it can actually prove and marks
     an open end with "+" rather than inventing a number. */
  const pageSize = page?.items.length ?? 0
  const hasMore = page?.has_more ?? false
  const rowsBefore = isPreview ? 0 : liveHook.rowsBefore
  const pageIndex = isPreview ? 0 : liveHook.pageIndex

  return (
    <>
      {isPreview && <AdminPreviewBanner />}
      <section className="page-body">
        <header className="audit-header">
          <h2>Audit log</h2>
        </header>

        {/* Filter row ----------------------------------------------- */}
        {/* Below 768px the five fields collapse behind this toggle — a phone has no width to lay them out in — and
            the chip beside it says what is currently narrowing the log. */}
        <div className="audit-filters-bar">
          <button
            type="button"
            className="btn-ghost audit-filters-toggle"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            Filters
          </button>
          <span className="audit-filters-chip muted small">{filterSummary}</span>
        </div>
        {/* Each control is a labelled stack so the five fields share one baseline, and the unlabelled "Clear
            filters" button lines up with the inputs rather than floating at the top of the row. */}
        <div className={`audit-filters${filtersOpen ? ' is-open' : ''}`}>
          <label className="audit-filter">
            <span className="audit-filter-label">Feature</span>
            <select
              className="role-select"
              value={filters.source_feature ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  source_feature: e.target.value || undefined,
                }))
              }
            >
              <option value="">All features</option>
              {FEATURE_NUMBERS.map((n) => (
                <option key={n} value={n}>
                  F{n} · {featureLabel(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="audit-filter">
            <span className="audit-filter-label">Actor</span>
            <select
              className="role-select"
              value={filters.actor_type ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  actor_type: (e.target.value || undefined) as AuditFilters['actor_type'],
                }))
              }
            >
              <option value="">All actors</option>
              {ACTOR_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="audit-filter">
            <span className="audit-filter-label">Action type</span>
            <select
              className="role-select"
              value={filters.action ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  action: (e.target.value || undefined) as ActionType | undefined,
                }))
              }
            >
              <option value="">All actions</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="audit-filter">
            <span className="audit-filter-label">From</span>
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  from: e.target.value || undefined,
                }))
              }
            />
          </label>
          <label className="audit-filter">
            <span className="audit-filter-label">To</span>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  to: e.target.value || undefined,
                }))
              }
            />
          </label>
          <button type="button" className="btn-ghost" onClick={clear}>
            Clear filters
          </button>
        </div>

        {/* Summary line --------------------------------------------- */}
        <div className="audit-summary">
          <span className="muted">
            {summary.entries} entries · {summary.actionTypes} action types
            {loading ? ' · loading…' : ''}
          </span>
          <span className="muted">
            {summary.actionTypes >= ACTION_TYPES.length
              ? `All ${ACTION_TYPES.length} audit action types are represented.`
              : `${summary.actionTypes} of ${ACTION_TYPES.length} audit action types are represented.`}
          </span>
        </div>
        <p className="audit-hint muted small">Tap a row to see before and after values.</p>

        {notFoundId && !expanded && (
          <div className="audit-notice is-error" role="alert">
            <strong>Audit entry not found</strong>
            <span>The link may be old, or the entry ID is wrong. Showing the latest entries instead.</span>
          </div>
        )}

        {/* Linked entry that is not on the page in view -------------- */}
        {expanded && !onPage && linked.id === expanded && (linked.loading || linked.entry) && (
          <div className="audit-linked" aria-live="polite">
            <div className="audit-linked-head">
              <span>
                {linked.entry ? (
                  <>
                    Linked entry <span className="mono">#{linked.entry.seq}</span> ·{' '}
                    <span className={`action-pill ${actionClass(linked.entry.action)}`}>{linked.entry.action.replace(/_/g, ' ')}</span>{' '}
                    {linked.entry.summary}
                  </>
                ) : (
                  'Loading linked entry…'
                )}
              </span>
              <button type="button" className="btn-ghost" onClick={() => openEntry(null)}>
                Close
              </button>
            </div>
            {linked.entry && <EntryDetail e={linked.entry} />}
          </div>
        )}

        {/* Table --------------------------------------------------- */}
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Actor / Role</th>
                <th>Feature</th>
                <th>Action</th>
                <th>Target</th>
                <th>Summary</th>
                <th>Time (sim)</th>
              </tr>
            </thead>
            <tbody>
              {page && page.items.length > 0 ? (
                page.items.flatMap((e) => {
                  const rows = [renderRow(e)]
                  if (expanded === e.id) {
                    rows.push(
                      <tr key={`${e.seq}-detail`} className="detail-row">
                        <td colSpan={7}>
                          <EntryDetail e={e} />
                        </td>
                      </tr>,
                    )
                  }
                  return rows
                })
              ) : (
                <tr>
                  <td colSpan={7} className="empty">
                    {loading ? 'Loading…' : 'No audit entries match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination ---------------------------------------------- */}
        <div className="audit-footer">
          <span className="muted small">
            {pageSize === 0
              ? 'No entries'
              : `Showing ${rowsBefore + 1}–${rowsBefore + pageSize} of ${hasMore ? `${rowsBefore + pageSize}+` : rowsBefore + pageSize} entries`}
          </span>
          <div className="audit-pagination">
            <label>
              Rows
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <button type="button" className="btn-ghost" disabled={!hasPrev} onClick={() => prevPage()}>
              Previous
            </button>
            <span className="page-of">
              Page {pageIndex + 1} of {hasMore ? `${pageIndex + 1}+` : pageIndex + 1}
            </span>
            <button type="button" className="btn-ghost" disabled={!hasMore} onClick={() => nextPage()}>
              Next
            </button>
          </div>
        </div>

        <p className="audit-footnote muted small">Read only. Entries can’t be edited or deleted. Times use the simulation clock.</p>
      </section>
    </>
  )
}
