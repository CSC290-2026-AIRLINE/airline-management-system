import { useEffect, useState } from 'react'

type LoadResult<T> = { key: string; data: T } | { key: string; error: string }

/**
 * Loads one dataset whenever `key` changes. While a new request is in flight the previous data stays on screen, and
 * `loading` tells the page to dim it. `load` is rebuilt on every render, so the key alone drives the request.
 */
export function useBiLoad<T>(key: string, load: () => Promise<T>) {
  const [result, setResult] = useState<LoadResult<T> | null>(null)

  useEffect(() => {
    let active = true
    load()
      .then((data) => {
        if (active) setResult({ key, data })
      })
      .catch((error: unknown) => {
        if (active) setResult({ key, error: error instanceof Error ? error.message : 'Something went wrong' })
      })
    return () => {
      active = false
    }
    // The loader is rebuilt on every render; the key is what should trigger a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const current = result?.key === key ? result : null
  return {
    data: result && 'data' in result ? result.data : null,
    loading: current === null,
    error: current && 'error' in current ? current.error : null,
  }
}
