import { usePagedList } from './usePagedList'

interface ReasonRow {
  code: string
  category: string
  description: string
}

// The active disruption reasons from the database, as dropdown options ("WX · Weather").
export function useDisruptionReasons() {
  const { rows, loading, error } = usePagedList<ReasonRow>('/disruption-reasons')
  return { reasons: rows.map((r) => ({ code: r.code, label: `${r.code} · ${r.description}` })), loading, error }
}
