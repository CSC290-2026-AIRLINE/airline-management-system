import { useEffect, useState } from 'react'
import { useLostReportApi } from '../api/lost-reports'
import { errorMessage } from './useFoundBags'

interface PhotoState {
  /** The case this answer belongs to; while it differs from the current one, the photo is loading. */
  forId: string | null
  url: string | null
  error: string | null
}

/**
 * The bag photo a passenger attached to a case, as an object URL for `<img>` (the endpoint needs the sign-in token, which
 * an image tag cannot send). Nothing is fetched when the case has no photo. The URL is released when the case changes.
 */
export function useCasePhoto(reportId: string, hasPhoto: boolean) {
  const api = useLostReportApi()
  const [state, setState] = useState<PhotoState>({ forId: null, url: null, error: null })

  useEffect(() => {
    if (!hasPhoto) return
    let cancelled = false
    let url: string | null = null
    ;(async () => {
      try {
        const blob = await api.photo(reportId)
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setState({ forId: reportId, url, error: null })
      } catch (e: unknown) {
        if (!cancelled) setState({ forId: reportId, url: null, error: errorMessage(e) })
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, hasPhoto])

  const current = state.forId === reportId
  return {
    loading: hasPhoto && !current,
    url: hasPhoto && current ? state.url : null,
    error: hasPhoto && current ? state.error : null,
  }
}
