import type { FlightSearchParams } from '../../booking-search/search-params'
import type { BookingDetail } from '../api/types'

const LEG_KEYS = ['leg1', 'leg2', 'leg3', 'leg4', 'leg5'] as const

/**
 * The search that finds the flights of a booking again, so a customer who wants other flights does not have to type the
 * route and the party again.
 *
 * The legs come from the segments in the order the booking flies them, and each leg carries the day the flight leaves
 * (`service_date`), which is the date the search form asks for. The fares are not carried over: the customer picks the
 * new flights and their fares in the search results.
 */
export function searchParamsForBooking(booking: BookingDetail): FlightSearchParams {
  const params: FlightSearchParams = { trip: booking.tripType }
  const segments = [...booking.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)

  segments.slice(0, LEG_KEYS.length).forEach((segment, index) => {
    params[LEG_KEYS[index]] = `${segment.origin},${segment.destination},${segment.serviceDate}`
  })

  const party = { adults: 0, children: 0, infants: 0 }
  for (const passenger of booking.passengers) {
    if (passenger.passengerType === 'adult') party.adults += 1
    else if (passenger.passengerType === 'child') party.children += 1
    else party.infants += 1
  }
  params.adults = party.adults
  params.children = party.children
  params.infants = party.infants

  const cabin = segments[0]?.cabin
  if (cabin) params.cabin = cabin

  // The results are searched right away, so the customer sees the other flights without pressing anything.
  params.submitted = 1
  return params
}
