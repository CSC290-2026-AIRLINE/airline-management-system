import { useLayoutEffect, useState } from 'react'
import { createHttpApi } from './client.ts'
import type { CheckInApi } from './client.ts'

export type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

/** Without a session the request goes out unauthenticated and the API answers 401. */
const anonymous: FetchWithAuth = (path, init) => fetch(`${API_URL}${path}`, { ...init, credentials: 'include' })

/**
 * The api keeps one identity for the life of the page. The shared AuthProvider hands out a new `fetchWithAuth` on
 * every render (a token refresh, a window focus); the api reads the latest one through a closure, so the effects that
 * depend on it do not re-run. A re-run used to give the held seat back while the passenger was still on the step.
 */
export function useCheckInApi(fetchWithAuth: FetchWithAuth | null): CheckInApi {
  const [{ switchSession, api }] = useState(() => stableApi(fetchWithAuth ?? anonymous))
  // A layout effect runs before any child's effect, so a request made on mount already uses the current session.
  useLayoutEffect(() => {
    switchSession(fetchWithAuth ?? anonymous)
  }, [switchSession, fetchWithAuth])
  return api
}

/** One api for the page, and the function that changes the session it sends its requests through. */
function stableApi(initial: FetchWithAuth): { switchSession: (next: FetchWithAuth) => void; api: CheckInApi } {
  let session = initial
  return {
    switchSession: (next) => {
      session = next
    },
    api: createHttpApi((path, init) => session(path, init)),
  }
}
