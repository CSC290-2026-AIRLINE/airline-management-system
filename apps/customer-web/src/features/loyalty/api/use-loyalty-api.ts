import { useEffect } from 'react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { createHttpLoyaltyApi } from './http-loyalty-api'
import type { LoyaltyApi } from './types'

type FetchWithAuth = ReturnType<typeof useAppAuth>['fetchWithAuth']

// fetchWithAuth is a new function on every render, so one stable client reads the latest one from here. Pages pass the
// client to useLoad, so its identity must not change between renders. The hook's effect sets it before the effects of
// the page that called the hook, which is where requests start.
let currentFetch: FetchWithAuth | null = null
const httpApi = createHttpLoyaltyApi((path, init) => {
  if (!currentFetch) return Promise.reject(new Error('Not signed in.'))
  return currentFetch(path, init)
})

// The Feature 11 customer routes on the backend (/api/loyalty/...).
export function useLoyaltyApi(): LoyaltyApi {
  const { fetchWithAuth } = useAppAuth()
  useEffect(() => {
    currentFetch = fetchWithAuth
  })
  return httpApi
}
