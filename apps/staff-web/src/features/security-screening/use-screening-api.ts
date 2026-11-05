import { useEffect, useEffectEvent, useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { screeningRequest } from './screening-api'

// This hook owns one feature request; it adds no shared fetch/cache or token mechanism.
export function useScreeningRead<T>(path: string, refresh: number) {
  const { fetchWithAuth, user, accessToken, isLoading } = useAppAuth()
  const fetchLatest = useEffectEvent(fetchWithAuth)
  const enabled = !isLoading && !!accessToken && !!user
  const key = JSON.stringify([path, refresh, user?.id, enabled])
  const [result, setResult] = useState<{ key: string; data?: T; error?: Error }>()
  useEffect(() => {
    if (!enabled || !path) return
    const abort = new AbortController()
    void screeningRequest<T>(fetchLatest, path, { signal: abort.signal }).then(
      (data) => {
        if (!abort.signal.aborted) setResult({ key, data })
      },
      (error: unknown) => {
        if (!abort.signal.aborted) setResult({ key, error: error instanceof Error ? error : new Error('Could not load screening data.') })
      },
    )
    return () => abort.abort()
  }, [path, enabled, key])
  const current = result?.key === key ? result : undefined
  return {
    data: current?.data,
    error: current?.error,
    loading: isLoading || (enabled && !!path && !current),
    authError: !isLoading && !enabled ? 'Your staff session is unavailable. Sign out and sign in again.' : undefined,
  }
}
