import { useCallback, useEffect, useRef, useState } from 'react'
import { toApiError } from '../lib/errors'
import { useBookingPnrApi, type ApiError } from './client'
import type { BookingDetail } from './types'

interface BookingState {
  booking: BookingDetail | null
  error: ApiError | null
  isLoading: boolean
}

export function useBooking(reference: string) {
  const api = useBookingPnrApi()
  const apiRef = useRef(api)
  const requestRef = useRef(0)
  const [state, setState] = useState<BookingState>({ booking: null, error: null, isLoading: true })

  useEffect(() => {
    apiRef.current = api
  }, [api])

  const load = useCallback(async () => {
    const requestId = ++requestRef.current

    try {
      const booking = await apiRef.current.getBooking(reference)
      if (requestRef.current === requestId) {
        setState({ booking, error: null, isLoading: false })
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setState({ booking: null, error: toApiError(error), isLoading: false })
      }
    }
  }, [reference])

  useEffect(() => {
    void load()
    return () => {
      requestRef.current += 1
    }
  }, [load])

  return { ...state, reload: load }
}
