import { useEffect, useRef, useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { loadSecurityAccess, type SecurityAccess } from './security-access'

export function useSecurityAccess() {
  const { user, accessToken, isLoading, fetchWithAuth } = useAppAuth()
  const latest = useRef(fetchWithAuth)
  useEffect(() => {
    latest.current = fetchWithAuth
  }, [fetchWithAuth])
  const [result, setResult] = useState<{ userId: string; token: string; status: SecurityAccess } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const userId = user?.id
  useEffect(() => {
    if (isLoading || !userId || !accessToken) return
    const controller = new AbortController()
    void loadSecurityAccess((path, init) => latest.current(path, init), controller.signal).then(
      (status) => {
        if (!controller.signal.aborted) setResult({ userId, token: accessToken, status })
      },
      () => {
        if (!controller.signal.aborted) setResult({ userId, token: accessToken, status: 'error' })
      },
    )
    return () => controller.abort()
  }, [userId, accessToken, isLoading, attempt])
  const status = isLoading
    ? 'loading'
    : !userId || !accessToken
      ? 'unauthenticated'
      : result?.userId === userId && result.token === accessToken
        ? result.status
        : 'loading'
  return { status, retry: () => setAttempt((value) => value + 1) }
}
