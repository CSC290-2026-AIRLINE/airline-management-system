import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { createHttpStaffApi, type StaffApi } from './index.ts'

/** The real staff API, wired to the signed-in session. */
export function useHttpStaffApi(): StaffApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => createHttpStaffApi(fetchWithAuth), [fetchWithAuth])
}
