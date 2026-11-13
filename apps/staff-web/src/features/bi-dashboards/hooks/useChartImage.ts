import { useEffect, useState } from 'react'
import { filterQuery, useBiApi, type BiChartName, type BiFilters } from '../api/bi'

type ImageResult = { requestKey: string; url: string } | { requestKey: string; error: string }

/**
 * Fetches one chart as SVG with the Bearer token and returns an object URL for `<img>`. A plain `<img src>` cannot send
 * the token, so the image is fetched here. The URL is released when the request changes or the card unmounts.
 */
export function useChartImage(name: BiChartName, filters: BiFilters) {
  const api = useBiApi()
  const [result, setResult] = useState<ImageResult | null>(null)
  const requestKey = `${name}?${filterQuery(filters)}`
  const [selection, setSelection] = useState(requestKey)
  if (selection !== requestKey) {
    setSelection(requestKey)
    setResult(null)
  }

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    api
      .getChartBlob(name, filters)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setResult({ requestKey, url: objectUrl })
      })
      .catch((error: unknown) => {
        if (active) setResult({ requestKey, error: error instanceof Error ? error.message : 'Unknown error' })
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // See useBiDashboard: the request key drives the fetch, not the helper identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const current = selection === requestKey && result?.requestKey === requestKey ? result : null
  return {
    url: current && 'url' in current ? current.url : null,
    loading: current === null,
    error: current && 'error' in current ? current.error : null,
  }
}
