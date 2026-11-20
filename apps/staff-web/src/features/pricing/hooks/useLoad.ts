import { useEffect, useState } from 'react'
import { errorMessage } from '../api'

interface Result<T> {
  key: string
  data?: T
  error?: string
}

// Runs `load` whenever `key` changes or reload() is called, and exposes loading / error / data.
// `key` must name everything `load` depends on. While reloading, the previous data for the same key stays visible.
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result<T> | null>(null)
  const requestKey = `${key}#${version}`

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => !cancelled && setResult({ key: requestKey, data }),
      (error: unknown) => !cancelled && setResult({ key: requestKey, error: errorMessage(error) }),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey stands for load's inputs; load is a new closure each render
  }, [requestKey])

  const sameKey = result?.key.startsWith(`${key}#`)
  return {
    loading: result?.key !== requestKey,
    error: result?.key === requestKey ? result.error : undefined,
    data: sameKey ? result?.data : undefined,
    reload: () => setVersion((v) => v + 1),
  }
}
