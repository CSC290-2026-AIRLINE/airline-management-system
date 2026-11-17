import { CONNECTED } from '../connected'
import type { AircraftOption } from '../types'
import type { Fetcher } from './usePagedList'
import { useResource } from './useResource'

interface AircraftRow {
  id: string
  tail_number: string
  type_code: string
  model: string
  max_range_km: number
}

// The aircraft a flight can be given, from GET /aircraft. Whether one can fly a particular flight is the gate check's answer, so every
// aircraft is `usable` here.
// ponytail: the list reads Feature 9's tables through the aircraft directory until Feature 9 has an API.
export function useAircraft(fetcher: Fetcher) {
  const res = useResource<{ data: AircraftRow[] }>(CONNECTED.aircraft ? '/aircraft' : null, fetcher)
  const aircraft: AircraftOption[] = (res.data?.data ?? []).map((a) => ({ id: a.id, label: `${a.tail_number} · ${a.model}`, usable: true }))
  return { aircraft, loading: res.loading, error: res.error }
}
