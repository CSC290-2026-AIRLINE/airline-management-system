import type { AuditEntry, AuditFilters, AuditPage } from '../types'
import { useFetchJson } from './fetch'

export interface AuditQuery extends AuditFilters {
  cursor?: string | null
  limit?: number
}

/** `2026-11-01` → that day's first (or, with `endOfDay`, last) millisecond in the viewer's time zone, as an instant. */
export function localDayBound(date: string, endOfDay = false): string {
  const [y, m, d] = date.split('-').map(Number)
  const at = endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d)
  return at.toISOString()
}

export function useListAudit() {
  const fetchJson = useFetchJson()
  return async function listAudit(query: AuditQuery): Promise<AuditPage> {
    const params = new URLSearchParams()
    if (query.source_feature) params.set('source_feature', query.source_feature)
    if (query.actor_type) params.set('actor_type', query.actor_type)
    if (query.actor_id) params.set('actor_id', query.actor_id)
    if (query.action) params.set('action', query.action)
    // The dates mean days as the viewer sees them (the table shows local times), not UTC days.
    if (query.from) params.set('from', localDayBound(query.from))
    if (query.to) params.set('to', localDayBound(query.to, true))
    if (query.cursor) params.set('cursor', query.cursor)
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    const qs = params.toString()
    return fetchJson<AuditPage>(qs ? `/api/admin/audit-log?${qs}` : '/api/admin/audit-log')
  }
}

/**
 * One entry by id — the deep link `/admin/audit-log/:id`, and any sensitive entry that is opened. A sensitive entry
 * comes back masked, and the server records the opening as a `view_sensitive` entry.
 */
export function useGetAuditEntry() {
  const fetchJson = useFetchJson()
  return (id: string) => fetchJson<AuditEntry>(`/api/admin/audit-log/${encodeURIComponent(id)}`)
}
