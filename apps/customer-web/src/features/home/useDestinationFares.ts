import { useEffect, useState } from 'react'
import { addDays, todayKey } from '@customer-web/components/ui/date-keys'
import { useBookingSearchApi } from '@customer-web/features/booking-search/api/client'
import { AIRPORTS } from '@customer-web/features/booking-search/components/airports'
import { DESTINATIONS } from './destinations'

/** The cheapest economy fare found for a destination, and the day it is on. */
export interface DestinationFare {
  price: number
  currency: string
  /** `YYYY-MM-DD`, in the departure airport's calendar. */
  date: string
}

export type DestinationFares = { status: 'loading' } | { status: 'error' } | { status: 'ready'; fares: Record<string, DestinationFare> }

/** How many days ahead are searched, starting tomorrow. */
const DAYS_AHEAD = 20
/** The search API takes at most five legs per request. */
const LEGS_PER_REQUEST = 5

/**
 * Fares for the trending destinations from one departure airport, read from the public flight search. That API has no
 * "cheapest fare" call, so the "from" price is the lowest fare over the next few weeks: a multi-city request answers
 * five days at a time. A destination with no bookable economy fare in the window is left out, so the page never
 * shows a price it cannot book. Airports outside the seeded network (see `AIRPORTS`) cannot have flights and are skipped.
 */
export function useDestinationFares(origin: string): DestinationFares {
  const { searchFlights } = useBookingSearchApi()
  // Keyed by origin, so a change of origin reads as loading again without resetting state inside the effect.
  const [result, setResult] = useState<{ origin: string; value: DestinationFares } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const today = todayKey()
    const days = Array.from({ length: DAYS_AHEAD }, (_, index) => addDays(today, index + 1))
    const batches = Array.from({ length: Math.ceil(days.length / LEGS_PER_REQUEST) }, (_, index) =>
      days.slice(index * LEGS_PER_REQUEST, (index + 1) * LEGS_PER_REQUEST),
    )
    const targets = DESTINATIONS.filter(
      (destination) => destination.code !== origin && AIRPORTS.some((airport) => airport.code === destination.code),
    )

    async function cheapestFare(destinationCode: string): Promise<DestinationFare | undefined> {
      const responses = await Promise.all(
        batches.map((batch) =>
          searchFlights(
            {
              tripType: 'multi_city',
              legs: batch.map((date) => ({ origin, destination: destinationCode, date })),
              adults: 1,
              children: 0,
              infants: 0,
            },
            controller.signal,
          ),
        ),
      )
      let best: DestinationFare | undefined
      for (const { legs } of responses) {
        for (const { leg, options } of legs) {
          for (const option of options) {
            for (const cabin of option.cabins) {
              if (cabin.cabin !== 'economy' || cabin.unavailableReason !== null || cabin.fareQuoteId === null || cabin.seatsLeft < 1)
                continue
              if (!best || cabin.pricePerPassenger < best.price) {
                best = { price: cabin.pricePerPassenger, currency: cabin.currency, date: leg.date }
              }
            }
          }
        }
      }
      return best
    }

    void Promise.allSettled(targets.map((destination) => cheapestFare(destination.code))).then((settled) => {
      if (controller.signal.aborted) return
      const fares: Record<string, DestinationFare> = {}
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled' && outcome.value) fares[targets[index].code] = outcome.value
      })
      const everyRequestFailed = settled.length > 0 && settled.every((outcome) => outcome.status === 'rejected')
      setResult({ origin, value: everyRequestFailed ? { status: 'error' } : { status: 'ready', fares } })
    })

    return () => controller.abort()
    // `searchFlights` is a new function every render but only reads VITE_API_URL, like in FlightSearchPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin])

  return result?.origin === origin ? result.value : { status: 'loading' }
}
