import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { usePagedList } from './usePagedList'

interface ReasonRow {
  code: string
  category: string
  description: string
}

// The active disruption reasons from the database, as dropdown options ("WX · Weather").
export function useDisruptionReasons() {
  const { fetchWithAuth } = useAppAuth()
  const { rows, loading, error } = usePagedList<ReasonRow>('/disruption-reasons', fetchWithAuth)
  return { reasons: rows.map((r) => ({ code: r.code, label: `${r.code} · ${r.description}` })), loading, error }
}
