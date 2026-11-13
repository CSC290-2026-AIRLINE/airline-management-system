import { useEffect, useState } from 'react'

type LoadResult<T> = { key: string; data: T } | { key: string; error: string }

/**
 * Only exposes data belonging to the current selection. Previous successful data is separate, for stable filter
 * options while a new selection loads; it must not be presented as the new selection's figures.
 */
export function useBiLoad<T>(key: string, load: () => Promise<T>) {
  const [result, setResult] = useState<LoadResult<T> | null>(null)
  const [previousData, setPreviousData] = useState<T | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestKey = JSON.stringify([key, attempt])
  const [selection, setSelection] = useState(requestKey)
  // A -> B -> A must fetch A again, even when B has not returned yet. Discard the old result on selection changes.
  if (selection !== requestKey) {
    setSelection(requestKey)
    setResult(null)
  }

  useEffect(() => {
    let active = true
    load()
      .then((data) => {
        if (active) {
          setResult({ key: requestKey, data })
          setPreviousData(data)
        }
      })
      .catch((error: unknown) => {
        if (active) setResult({ key: requestKey, error: error instanceof Error ? error.message : 'Something went wrong' })
      })
    return () => {
      active = false
    }
    // The loader is rebuilt on every render; the key is what should trigger a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const current = selection === requestKey && result?.key === requestKey ? result : null
  return {
    data: current && 'data' in current ? current.data : null,
    previousData,
    loading: current === null,
    error: current && 'error' in current ? current.error : null,
    retry: () => setAttempt((value) => value + 1),
  }
}
