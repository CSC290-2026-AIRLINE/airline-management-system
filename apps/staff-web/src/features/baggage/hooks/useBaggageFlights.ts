import { useEffect, useState } from 'react'
import { useFoundBagApi, type BaggageAirport, type BaggageFlight } from '../api/found-bags'
import { errorMessage } from './useFoundBags'
import { useRetryWhileUnreachable } from './useRetryWhileUnreachable'

/**
 * Flights that landed at an airport in the last few days, for the "Came off flight" picker. A failed lookup leaves the
 * list empty, so the form still works with "Not known".
 */
export function useFlightsInto(airportCode: string) {
  const api = useFoundBagApi()
  const [state, setState] = useState<{ forAirport: string | null; flights: BaggageFlight[] }>({ forAirport: null, flights: [] })

  useEffect(() => {
    if (!airportCode) return
    let cancelled = false
    api
      .flightsInto(airportCode)
      .catch(() => [])
      .then((flights) => {
        if (!cancelled) setState({ forAirport: airportCode, flights })
      })
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airportCode])

  return state.forAirport === airportCode ? state.flights : []
}

/** Flights from one airport to another in the next few days, for "On flight" when a bag is sent. */
export function useDepartures(from: string, to: string) {
  const api = useFoundBagApi()
  const key = from && to ? `${from}-${to}` : null
  const [state, setState] = useState<{ forKey: string | null; flights: BaggageFlight[] }>({ forKey: null, flights: [] })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    api
      .departures(from, to)
      .catch(() => [])
      .then((flights) => {
        if (!cancelled) setState({ forKey: key, flights })
      })
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return key && state.forKey === key ? state.flights : []
}

/** One flight by id, for the bag detail. `null` while loading, when there is no id, or when the lookup failed. */
export function useFlight(id: string | null | undefined) {
  const api = useFoundBagApi()
  const [state, setState] = useState<{ forId: string | null; flight: BaggageFlight | null }>({ forId: null, flight: null })

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .flight(id)
      .catch(() => null)
      .then((flight) => {
        if (!cancelled) setState({ forId: id, flight })
      })
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return { flight: state.forId === id ? state.flight : null, loading: !!id && state.forId !== id }
}

/** Diverted flights of the last few days that still have bags in the hold to add. */
export function useDivertedFlights() {
  const api = useFoundBagApi()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<{ forKey: number | null; error: string | null; flights: BaggageFlight[] }>({
    forKey: null,
    error: null,
    flights: [],
  })

  useEffect(() => {
    let cancelled = false
    api
      .divertedFlights()
      .then((flights) => {
        if (!cancelled) setState({ forKey: reloadKey, error: null, flights })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState((prev) => ({ ...prev, forKey: reloadKey, error: errorMessage(e) }))
      })
    return () => {
      cancelled = true
    }
    // See useFlightsInto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  const reload = () => setReloadKey((k) => k + 1)
  useRetryWhileUnreachable(state.error, reload)

  // Only the first load shows as loading, so the card does not flash after adding bags.
  return { loading: state.forKey === null, error: state.error, flights: state.flights, reload }
}

/** Active airports from Feature 2's airport table, for airport pickers. A failed lookup leaves the list empty. */
export function useAirports() {
  const api = useFoundBagApi()
  const [airports, setAirports] = useState<BaggageAirport[]>([])

  useEffect(() => {
    let cancelled = false
    api
      .airports()
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setAirports(list)
      })
    return () => {
      cancelled = true
    }
    // See useFlightsInto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return airports
}
