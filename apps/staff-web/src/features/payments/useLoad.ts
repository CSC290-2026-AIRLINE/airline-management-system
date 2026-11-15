import { useEffect, useState } from 'react'
import { errorMessage } from './api'

/** Runs `load` when `key` changes or reload() is called. A stand-in until the shared TanStack Query setup lands. */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null)
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
