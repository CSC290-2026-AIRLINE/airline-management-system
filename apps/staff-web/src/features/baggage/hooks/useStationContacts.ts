import { useEffect, useState } from 'react'
import { useFoundBagApi, type SaveStationContactBody, type StationContact } from '../api/found-bags'
import { errorMessage } from './useFoundBags'
import { useRetryWhileUnreachable } from './useRetryWhileUnreachable'

interface State {
  loading: boolean
  error: string | null
  contacts: StationContact[]
}

/** The baggage desk contact of every airport that has one. A save swaps in the row the server returns. */
export function useStationContacts() {
  const api = useFoundBagApi()
  const [state, setState] = useState<State>({ loading: true, error: null, contacts: [] })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const contacts = await api.stations()
        if (!cancelled) setState({ loading: false, error: null, contacts })
      } catch (e: unknown) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e), contacts: [] })
      }
    })()
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  useRetryWhileUnreachable(state.error, () => setReloadKey((k) => k + 1))

  async function save(airportCode: string, body: SaveStationContactBody): Promise<void> {
    const saved = await api.saveStation(airportCode, body)
    setState((prev) => {
      const others = prev.contacts.filter((c) => c.airportCode !== saved.airportCode)
      return { ...prev, contacts: [...others, saved].sort((a, b) => a.airportCode.localeCompare(b.airportCode)) }
    })
  }

  return { ...state, save }
}
