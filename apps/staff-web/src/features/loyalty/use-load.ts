import { useCallback, useEffect, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

// Local loading state for one request. Replace with TanStack Query once the Dev Leads add the shared setup.
export function useLoad<T>(load: () => Promise<T>): [LoadState<T>, () => void] {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (error: unknown) =>
        !cancelled && setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }),
    )
    return () => {
      cancelled = true
    }
  }, [load, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])
  return [state, reload]
}

// The message to show for a refused request.
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
