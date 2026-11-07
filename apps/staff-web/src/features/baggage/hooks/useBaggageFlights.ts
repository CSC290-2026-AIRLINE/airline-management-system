import { useEffect, useState } from 'react'
import { useFoundBagApi, type BaggageFlight } from '../api/found-bags'

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
