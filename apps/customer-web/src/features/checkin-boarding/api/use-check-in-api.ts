import { useMemo } from 'react'
import { createHttpApi } from './client.ts'
import type { CheckInApi } from './client.ts'

export type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

/** Without a session the request goes out unauthenticated and the API answers 401. */
const anonymous: FetchWithAuth = (path, init) => fetch(`${API_URL}${path}`, { ...init, credentials: 'include' })

export function useCheckInApi(fetchWithAuth: FetchWithAuth | null): CheckInApi {
  return useMemo(() => createHttpApi(fetchWithAuth ?? anonymous), [fetchWithAuth])
}
