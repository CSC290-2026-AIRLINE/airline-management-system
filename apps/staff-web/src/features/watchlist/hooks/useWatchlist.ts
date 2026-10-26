import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { entryName, type EntryFields, type EntryStatus, type ListType, type WatchlistEntry } from '../watchlist.types'

type ApiEntry = Omit<WatchlistEntry, 'dateOfBirth' | 'nationality' | 'passportNumber' | 'reason' | 'clearedAt' | 'clearReason'> & {
  dateOfBirth: string | null
  nationality: string | null
  passportNumber?: string | null
  passportLast4: string | null
  reason: string | null
  clearedAt: string | null
  clearReason: string | null
}
type ApiPage = { items: ApiEntry[]; nextCursor: string | null }
const toEntry = (row: ApiEntry): WatchlistEntry => ({
  ...row,
  dateOfBirth: row.dateOfBirth ?? '',
  nationality: row.nationality ?? '',
  passportNumber: row.passportNumber ?? '',
  passportLast4: row.passportLast4 ?? '',
  reason: row.reason ?? '',
  clearedAt: row.clearedAt ?? undefined,
  clearReason: row.clearReason ?? undefined,
})
const mobileQuery = '(max-width: 767px)'
function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(mobileQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
export function useWatchlist() {
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  )
  const pageSize = isMobile ? 3 : 20
  const { fetchWithAuth } = useAppAuth()
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])
  const [visibleEntries, setEntries] = useState<WatchlistEntry[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<EntryStatus | 'all'>('active')
  const [listType, setListType] = useState<ListType | 'all'>('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [pagination, setPagination] = useState<{ scope: string; cursors: string[]; index: number }>({ scope: '', cursors: [''], index: 0 })
  const scope = JSON.stringify([query, status, listType, revision, pageSize])
  const page = pagination.scope === scope ? pagination : { scope, cursors: [''], index: 0 }
  const cursor = page.cursors[page.index]
  const pageKey = JSON.stringify([scope, page.index, cursor])
  const [loadedKey, setLoadedKey] = useState('')
  const pending = loading || loadedKey !== pageKey
  const operation = useRef(false)
  const previousQuery = useRef(query)
  const listController = useRef<AbortController | null>(null)
  const request = useCallback(async <T>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response
    try {
      response = await fetchRef.current(`/api/watchlist${path}`, init)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
      throw new Error('Cannot reach the server. Check your connection and try again.', { cause })
    }
    if (!response.ok) {
      let description = 'The operation could not be completed. Please try again.'
      if (response.status === 401) description = 'Your session has expired. Sign in again.'
      else if (response.status === 403) description = 'A staff account with the security role is required.'
      else if (response.status === 404) description = 'This entry no longer exists. Refresh the list.'
      else if (response.status === 409) description = 'This entry changed or was already cleared. Refresh and try again.'
      else if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null
        description = Array.isArray(body?.message) ? body.message.join(' ') : (body?.message ?? 'Check the entered values.')
      }
      throw new Error(description)
    }
    return response.json() as Promise<T>
  }, [])
  const load = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ status, listType, limit: String(pageSize) })
      if (query.trim()) params.set('search', query.trim())
      if (cursor) params.set('cursor', cursor)
      try {
        const page = await request<ApiPage>(`?${params}`, { signal })
        if (signal?.aborted) return
        setEntries(page.items.map(toEntry))
        setNextCursor(page.nextCursor)
      } catch (cause) {
        if (!signal?.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load entries.')
          setEntries([])
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
          setLoadedKey(pageKey)
        }
      }
    },
    [request, query, status, listType, pageSize, pageKey],
  )
  useEffect(() => {
    listController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    const delay = previousQuery.current !== query ? 250 : 0
    previousQuery.current = query
    const timer = window.setTimeout(() => void load(cursor || undefined, controller.signal), delay)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [load, revision, query, cursor])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 5000)
    return () => window.clearTimeout(timer)
  }, [message])
  async function mutate(path: string, method: string, body: EntryFields | { reason: string }) {
    if (operation.current) throw new Error('A request is already in progress.')
    operation.current = true
    setSaving(true)
    setMessage('')
    try {
      await request<ApiEntry>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } finally {
      operation.current = false
      setSaving(false)
    }
  }
  async function save(fields: EntryFields, existing?: WatchlistEntry) {
    await mutate(existing ? `/${existing.id}` : '', existing ? 'PATCH' : 'POST', fields)
    if (!existing) {
      setQuery('')
      setStatus('active')
      setListType('all')
    }
    setMessage(existing ? `Changes saved to ${entryName(fields)}'s entry.` : 'Entry added.')
    setRevision((value) => value + 1)
  }
  async function clear(entry: WatchlistEntry, reason: string) {
    await mutate(`/${entry.id}/clear`, 'POST', { reason })
    setMessage(`${entryName(entry)}'s entry cleared. It remains available under Status: Cleared.`)
    setRevision((value) => value + 1)
  }
  async function detail(id: string) {
    return toEntry(await request<ApiEntry>(`/${id}`))
  }
  function retry() {
    setRevision((value) => value + 1)
  }
  function selectPage(index: number) {
    if (pending || saving || !Number.isInteger(index) || index < 0 || index >= page.cursors.length) return
    setPagination({ ...page, index })
  }
  function nextPage() {
    if (pending || saving || !nextCursor || error) return
    const cursors = page.cursors[page.index + 1] === nextCursor ? page.cursors : [...page.cursors.slice(0, page.index + 1), nextCursor]
    setPagination({ scope, cursors, index: page.index + 1 })
  }
  return {
    visibleEntries,
    query,
    setQuery,
    status,
    setStatus,
    listType,
    setListType,
    message,
    setMessage,
    error,
    loading: pending,
    saving,
    nextCursor,
    retry,
    pageNumber: page.index + 1,
    visitedPages: page.cursors.length,
    selectPage,
    nextPage,
    previousPage: () => selectPage(page.index - 1),
    save,
    clear,
    detail,
  }
}
