import { useMemo, useState } from 'react'
import { useListAudit } from '../api/audit'
import { useAuditLog } from '../hooks/useAuditLog'
import { usePreviewMode } from '../hooks/usePreviewMode'
import { previewAudit } from '../preview-data'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { AdminPreviewBanner } from '../components/AdminPreviewBanner'
import type { AuditEntry, AuditFilters, AuditPage } from '../types'
import './AuditLogPage.css'

/* Filter dropdowns mirror the AUDIT_ACTIONS check in the DB. Keep these in sync with
 * apps/backend/src/modules/admin-console/dto/audit-query.dto.ts. */
const ACTION_TYPES = [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'role_change',
  'screen_access_change',
  'staff_status_change',
  'payment_capture',
  'payment_refund',
  'booking_lifecycle',
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

export function AuditLogPage() {
  const isPreview = usePreviewMode()
  const listAudit = useListAudit()

  const [filters, setFilters] = useState<AuditFilters>({
    source_feature: undefined,
    actor_type: undefined,
    action: undefined,
    from: undefined,
    to: undefined,
  })
  const [limit, setLimit] = useState(25)
  const [expanded, setExpanded] = useState<string | null>(null)

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

  /* The "best-effort" feature inventory: list of distinct action_types + source_features across all returned rows.
   * This is what the summary line in the screenshots reads. */
  const summary = useMemo(() => {
    if (!page) return { entries: 0, actionTypes: 0, features: 0 }
    const a = new Set<string>()
    const f = new Set<string>()
    for (const e of page.items) {
      a.add(e.action)
      f.add(e.source_feature)
    }
    return { entries: page.items.length, actionTypes: a.size, features: f.size }
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

  function renderRow(e: AuditEntry) {
    const isOpen = expanded === e.seq
    return (
      <tr key={e.seq} className={isOpen ? 'is-open' : ''} onClick={() => setExpanded(isOpen ? null : e.seq)}>
        <td className="mono small">#{e.seq}</td>
        <td>
          <span className="email">{e.actor_id ?? '—'}</span>
          <span className="muted small">
            {' '}
            · {e.actor_type}
            {e.actor_role ? ` (${e.actor_role})` : ''}
          </span>
        </td>
        <td>
          <span className="feature-tag">F{String(e.source_feature).padStart(2, '0')}</span>
        </td>
        <td>
          <span className={`action-pill ${actionClass(e.action)}`}>{e.action}</span>
        </td>
        <td>
          <span className="mono small">
            {e.entity_type}#{e.entity_id}
          </span>
        </td>
        <td className="ellipsis">{e.summary}</td>
        <td className="muted small">{formatDate(e.occurred_at ?? e.recorded_at)}</td>
      </tr>
    )
  }

  if (error) {
    return <AdminErrorCard page="Audit log" error={error} status={statusFromError(error)} onRetry={() => window.location.reload()} />
  }

  const hasPrev = !isPreview && liveHook.hasPrev
  const nextPage = () => {
    if (!isPreview) liveHook.nextPage()
  }
  const prevPage = () => {
    if (!isPreview) liveHook.prevPage()
  }

  return (
    <>
      {isPreview && <AdminPreviewBanner />}
      <section className="page-body">
        <header className="audit-header">
          <h2>Audit log</h2>
          <p className="muted">Read only. Entries can’t be edited or deleted. Times use the simulation clock.</p>
        </header>

        {/* Filter row ----------------------------------------------- */}
        <div className="audit-filters">
          <input
            className="filter-input"
            placeholder="Feature (e.g. 15)"
            value={filters.source_feature ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                source_feature: e.target.value || undefined,
              }))
            }
          />
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
          <label className="date-label">
            From{' '}
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
          <label className="date-label">
            To{' '}
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
        <p className="audit-summary muted">
          {summary.entries} entries · {summary.actionTypes} action types · {summary.features} features
          {loading ? ' · loading…' : ''}
        </p>

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
                  if (expanded === e.seq) {
                    rows.push(
                      <tr key={`${e.seq}-detail`} className="detail-row">
                        <td colSpan={7}>
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
                              <p className="muted small">{e.reason ?? '—'}</p>
                            </div>
                            <div>
                              <h5>Meta</h5>
                              <p className="muted small">
                                #{e.seq} · Sim {formatDate(e.occurred_at)} · Saved {formatDate(e.recorded_at)} · staff-web · Read only
                              </p>
                            </div>
                          </div>
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
            {page && page.items.length > 0 ? `Showing up to ${page.items.length} entries` : 'No entries'}
            {page?.has_more ? ' · more available' : ''}
          </span>
          <div className="audit-pagination">
            <label>
              Rows{' '}
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <button type="button" className="btn-ghost" disabled={!hasPrev} onClick={() => prevPage()}>
              Prev
            </button>
            <button type="button" className="btn-primary" disabled={!page?.has_more} onClick={() => nextPage()}>
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
