import { useEffect, useState } from 'react'
import type { SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import type { SeatMap, SeatType } from '../api/types'
import type { SeatChoice } from '../flow/integration'
import type { TravellerDraft } from '../flow/draft'

type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>
const seatTypes: Record<SeatType, string> = { standard: 'normal', extra_legroom: 'extra_legroom', exit: 'exit_row' }

// Discounts and taxes are applied after the seat fee, so ask pricing for each distinct passenger/seat quote.
export async function quoteSeatChoices(
  fetchWithAuth: FetchWithAuth,
  itinerary: SearchItinerary,
  travellers: TravellerDraft[],
  choices: SeatChoice[],
  maps: Record<string, SeatMap> | null,
  promoCode?: string,
  signal?: AbortSignal,
): Promise<number> {
  const groups = new Map<string, { flight_id: string; fare_class_id: string; seat_type?: string; count: number }>()
  for (const { flight, fare } of itinerary.selections) {
    for (const person of travellers.filter((item) => item.expectedType !== 'infant')) {
      const choice = choices.find((item) => item.flightId === flight.flightId && item.travellerKey === person.key)
      const seat = choice
        ? maps?.[flight.flightId]?.rows.flatMap((row) => row.seats).find((item) => item.seatCode === choice.seatCode)
        : undefined
      if (choice && !seat) throw new Error('Refresh the seat map before continuing.')
      const key = `${flight.flightId}:${fare.fareClassId}:${seat?.type ?? ''}`
      const group = groups.get(key)
      if (group) group.count += 1
      else
        groups.set(key, {
          flight_id: flight.flightId,
          fare_class_id: fare.fareClassId,
          ...(seat ? { seat_type: seatTypes[seat.type] } : {}),
          count: 1,
        })
    }
  }
  const currency = itinerary.selections[0]?.fare.currency
  const totals = await Promise.all(
    [...groups.values()].map(async ({ count, ...input }) => {
      const response = await fetchWithAuth('/api/fare-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, ...(promoCode ? { promo_code: promoCode } : {}) }),
        signal,
      })
      if (!response.ok) throw new Error('We could not update the price. Check your promo code or try again.')
      const quote = (await response.json()) as { total_amount?: unknown; currency?: unknown }
      const amount = Number(quote.total_amount)
      if (quote.total_amount == null || !Number.isFinite(amount) || amount < 0 || quote.currency !== currency)
        throw new Error('Pricing returned an unavailable total. Please try again.')
      return Math.round(amount * 100) * count
    }),
  )
  if (!totals.length) throw new Error('Add a passenger before continuing.')
  return totals.reduce((sum, cents) => sum + cents, 0) / 100
}

export function useSeatQuote(
  fetchWithAuth: FetchWithAuth,
  itinerary: SearchItinerary,
  travellers: TravellerDraft[],
  choices: SeatChoice[],
  maps: Record<string, SeatMap> | null,
  promoCode?: string,
) {
  const [retry, setRetry] = useState(0)
  const signature = JSON.stringify([
    itinerary.selections.map(({ flight, fare }) => [flight.flightId, fare.fareClassId]),
    travellers.map((person) => [person.key, person.expectedType]),
    choices,
    promoCode,
    retry,
    Boolean(maps),
  ])
  const [result, setResult] = useState<{ signature: string; total: number | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!maps) return
    const controller = new AbortController()
    void quoteSeatChoices(fetchWithAuth, itinerary, travellers, choices, maps, promoCode, controller.signal)
      .then((total) => {
        if (!controller.signal.aborted) setResult({ signature, total, error: null })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            signature,
            total: null,
            error: cause instanceof Error ? cause.message : 'Could not update the price. Please try again.',
          })
      })
    return () => controller.abort()
  }, [fetchWithAuth, itinerary, travellers, choices, maps, promoCode, retry, signature])
  return {
    total: maps && result?.signature === signature ? result.total : null,
    error: result?.signature === signature ? result.error : null,
    loading: !maps || result?.signature !== signature,
    retry: () => setRetry((value) => value + 1),
    forChoices: (nextChoices: SeatChoice[]) => quoteSeatChoices(fetchWithAuth, itinerary, travellers, nextChoices, maps, promoCode),
  }
}
