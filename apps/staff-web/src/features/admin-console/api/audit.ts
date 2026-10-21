import type { AuditFilters, AuditPage } from '../types'
import { useFetchJson } from './fetch'

export interface AuditQuery extends AuditFilters {
  cursor?: string | null
  limit?: number
}

export function useListAudit() {
  const fetchJson = useFetchJson()
  return async function listAudit(query: AuditQuery): Promise<AuditPage> {
    const params = new URLSearchParams()
    if (query.source_feature) params.set('source_feature', query.source_feature)
    if (query.actor_type) params.set('actor_type', query.actor_type)
    if (query.action) params.set('action', query.action)
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
    if (query.cursor) params.set('cursor', query.cursor)
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    const qs = params.toString()
    return fetchJson<AuditPage>(qs ? `/api/admin/audit-log?${qs}` : '/api/admin/audit-log')
  }
}
