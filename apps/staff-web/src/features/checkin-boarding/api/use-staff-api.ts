import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { createHttpStaffApi, createMockStaffApi, type StaffApi } from './index.ts'

/** The browser mock. It keeps its state for the whole demo session. */
export function useMockStaffApi(): StaffApi {
  return useMemo(() => createMockStaffApi(), [])
}

/** The real staff API, wired to the signed-in session. */
export function useHttpStaffApi(): StaffApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => createHttpStaffApi(fetchWithAuth), [fetchWithAuth])
}
