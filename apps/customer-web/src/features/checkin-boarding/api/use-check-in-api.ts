import { useMemo, useState } from 'react'
import { F6_MOCK } from './index.ts'
import { createHttpApi } from './client.ts'
import type { CheckInApi } from './client.ts'
import { createMockApi } from '../mock/mock-api.ts'

export type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

/** Without a session the request goes out unauthenticated and the API answers 401. */
const anonymous: FetchWithAuth = (path, init) => fetch(`${API_URL}${path}`, { ...init, credentials: 'include' })

export function useCheckInApi(fetchWithAuth: FetchWithAuth | null): CheckInApi {
  // The mock keeps every check-in in memory, so its instance has to survive re-renders.
  const [mock] = useState(() => createMockApi())
  return useMemo(() => (F6_MOCK ? mock : createHttpApi(fetchWithAuth ?? anonymous)), [mock, fetchWithAuth])
}
