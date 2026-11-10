import { useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { createHttpLoyaltyApi } from './http-loyalty-api'
import { createMockLoyaltyApi } from './mock-loyalty-api'
import type { LoyaltyApi } from './types'

// VITE_LOYALTY_API=http talks to the backend's /api/loyalty routes; anything else uses the in-memory mock, so the pages
// work before the Feature 11 backend module is merged.
const USE_HTTP = import.meta.env.VITE_LOYALTY_API === 'http'

type FetchWithAuth = ReturnType<typeof useAppAuth>['fetchWithAuth']

// fetchWithAuth is a new function on every render, so one stable client reads the latest one from here. The hook's
// effect sets it before the effects of the page that called the hook, which is where requests start.
let currentFetch: FetchWithAuth | null = null
const httpApi = createHttpLoyaltyApi((path, init) => {
  if (!currentFetch) return Promise.reject(new Error('Not signed in.'))
  return currentFetch(path, init)
})

// One mock for the whole session, so joining on one page shows on the next. Set sessionStorage "flysmiles-demo" to
// "new" and reload to see the Join page as a customer who has not joined.
let mockApi: LoyaltyApi | null = null

function startsAsMember() {
  try {
    return sessionStorage.getItem('flysmiles-demo') !== 'new'
  } catch {
    return true
  }
}

export function useLoyaltyApi(): LoyaltyApi {
  const { user } = useUser()
  const { fetchWithAuth } = useAppAuth()
  useEffect(() => {
    currentFetch = fetchWithAuth
  })

  if (USE_HTTP) return httpApi
  mockApi ??= createMockLoyaltyApi({
    member: startsAsMember(),
    name: user?.fullName || 'Anna Lee',
    email: user?.primaryEmailAddress?.emailAddress ?? 'anna.l@example.com',
  })
  return mockApi
}
