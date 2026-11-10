import { useEffect } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { createHttpStaffLoyaltyApi } from './http-staff-loyalty-api'
import type { StaffLoyaltyApi } from './types'

type FetchWithAuth = ReturnType<typeof useAppAuth>['fetchWithAuth']

// fetchWithAuth is a new function on every render, so one stable client reads the latest one from here. Pages pass the
// client to useLoad and useCallback, so its identity must not change between renders.
let currentFetch: FetchWithAuth | null = null

const api = createHttpStaffLoyaltyApi((path, init) => {
  if (!currentFetch) return Promise.reject(new Error('Not signed in.'))
  return currentFetch(path, init)
})

export function useStaffLoyaltyApi(): StaffLoyaltyApi {
  const { fetchWithAuth } = useAppAuth()
  useEffect(() => {
    currentFetch = fetchWithAuth
  })
  return api
}
