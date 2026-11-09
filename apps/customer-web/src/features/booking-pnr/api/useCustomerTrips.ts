import { useCallback, useEffect, useRef, useState } from 'react'
import { toApiError } from '../lib/errors'
import { useBookingPnrApi, type ApiError } from './client'
import type { CustomerTrips } from './types'

interface TripsState {
  trips: CustomerTrips | null
  error: ApiError | null
  isLoading: boolean
}

const EMPTY_TRIPS: CustomerTrips = { upcoming: [], past: [], serverNow: new Date(0).toISOString() }

/** My Trips (B11): the Upcoming and Past tabs of GET /customers/me/bookings. */
export function useCustomerTrips() {
  const api = useBookingPnrApi()
  const apiRef = useRef(api)
  const requestRef = useRef(0)
  const [state, setState] = useState<TripsState>({ trips: null, error: null, isLoading: true })

  useEffect(() => {
    apiRef.current = api
  }, [api])

  const load = useCallback(async () => {
    const requestId = ++requestRef.current

    try {
      const trips = await apiRef.current.getCustomerTrips()
      if (requestRef.current === requestId) {
        setState({ trips, error: null, isLoading: false })
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setState({ trips: null, error: toApiError(error), isLoading: false })
      }
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      requestRef.current += 1
    }
  }, [load])

  return { ...state, trips: state.trips ?? EMPTY_TRIPS, reload: load }
}
