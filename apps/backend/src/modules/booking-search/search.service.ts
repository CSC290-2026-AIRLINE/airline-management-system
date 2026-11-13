import { Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../booking-pnr/common/booking-error'
import {
  BOOKING_CLOCK,
  INVENTORY_PORT,
  PRICING_PORT,
  type BookingClock,
  type Cabin,
  type InventoryPort,
  type PricingPort,
} from '../booking-pnr/contracts'
import type { SearchFlightsDto } from './dto/search-flights.dto'

export interface SearchFare {
  cabin: Cabin
  fareClassId: string
  fareClassCode: string
  fareQuoteId: string | null
  pricePerPassenger: number
  currency: string
  seatsLeft: number
  unavailableReason: string | null
}

export interface SearchOption {
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  depAt: string
  arrAt: string
  durationMinutes: number
  cabins: SearchFare[]
}

function isCabin(value: string): value is Cabin {
  return ['economy', 'premium_economy', 'business', 'first'].includes(value)
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name)

  constructor(
    private readonly db: DbService,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(PRICING_PORT) private readonly pricing: PricingPort,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  async search(request: SearchFlightsDto) {
    this.validateTrip(request)
    const cutoff = new Date(this.clock.now().getTime() + 60 * 60 * 1000)
    const flights = await this.db.flight.findMany({
      where: {
        status: { in: ['scheduled', 'delayed'] },
        dep_at: { gte: cutoff },
        seat_inventory: { some: request.cabin ? { cabin: request.cabin } : {} },
        OR: request.legs.map((leg) => ({
          service_date: new Date(`${leg.date}T00:00:00Z`),
          route: { origin: leg.origin, destination: leg.destination },
        })),
      },
      include: { route: true, seat_inventory: true },
    })
    const keys = flights.flatMap((flight) =>
      flight.seat_inventory
        .filter((row) => !request.cabin || row.cabin === request.cabin)
        .map((row) => ({ flightId: flight.id, cabin: row.cabin })),
    )
    const counts = await this.inventory.availability(keys, {
      adults: request.adults,
      children: request.children,
      infants: request.infants,
    })
    const available = new Map(counts.map((row) => [`${row.flightId}/${row.cabin}`, row.seatsLeft]))
    const fares = flights.length
      ? await this.db.fare_class.findMany({
          where: { deleted_at: null, is_active: true, ...(request.cabin ? { cabin: request.cabin } : {}) },
          orderBy: { code: 'asc' },
        })
      : []
    // The base currency only fills the currency of an option whose quote failed; a priced option carries the
    // currency of its own quote. A settings failure must not take the whole search down with it.
    let baseCurrency = 'USD'
    if (fares.length) {
      try {
        baseCurrency = await this.pricing.baseCurrency()
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error'
        this.logger.warn(`Base currency unavailable, falling back to USD: ${reason}`)
      }
    }
    const options = new Map<string, SearchOption>()
    for (const flight of flights) {
      const cabins: SearchFare[] = []
      for (const fare of fares) {
        if (!isCabin(fare.cabin)) continue
        const seatsLeft = available.get(`${flight.id}/${fare.cabin}`) ?? 0
        if (seatsLeft < request.adults + request.children) continue
        try {
          const quote = await this.pricing.quote({ flightId: flight.id, cabin: fare.cabin, fareClassId: fare.id })
          cabins.push({
            cabin: fare.cabin,
            fareClassId: fare.id,
            fareClassCode: fare.code,
            fareQuoteId: quote.fareQuoteId,
            pricePerPassenger: quote.pricePerPassenger,
            currency: quote.currency,
            seatsLeft,
            unavailableReason: null,
          })
        } catch (error) {
          cabins.push({
            cabin: fare.cabin,
            fareClassId: fare.id,
            fareClassCode: fare.code,
            fareQuoteId: null,
            pricePerPassenger: 0,
            currency: baseCurrency,
            seatsLeft,
            unavailableReason: error instanceof BookingError ? error.message : 'Fare quote unavailable',
          })
        }
      }
      if (!cabins.length) continue
      options.set(flight.id, {
        flightId: flight.id,
        flightNumber: flight.flight_number,
        origin: flight.route.origin,
        destination: flight.route.destination,
        depAt: flight.dep_at.toISOString(),
        arrAt: flight.arr_at.toISOString(),
        durationMinutes: Math.round((flight.arr_at.getTime() - flight.dep_at.getTime()) / 60000),
        cabins,
      })
    }
    const price = (option: SearchOption) =>
      Math.min(...option.cabins.filter((fare) => !fare.unavailableReason).map((fare) => fare.pricePerPassenger))
    const compare = (a: SearchOption, b: SearchOption) => {
      if (request.sortBy === 'price') {
        const difference = price(a) - price(b)
        if (!Number.isNaN(difference) && difference !== 0) return difference
      }
      if (request.sortBy === 'duration' && a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes
      return a.depAt.localeCompare(b.depAt) || a.flightId.localeCompare(b.flightId)
    }
    return {
      legs: request.legs.map((leg) => ({
        leg,
        options: flights
          .filter(
            (flight) =>
              flight.route.origin === leg.origin &&
              flight.route.destination === leg.destination &&
              flight.service_date.toISOString().slice(0, 10) === leg.date,
          )
          .map((flight) => options.get(flight.id))
          .filter((option): option is SearchOption => !!option)
          .sort(compare),
      })),
    }
  }

  private validateTrip(request: SearchFlightsDto): void {
    const invalid = (message: string): never => {
      throw new BookingError('INVALID_BOOKING_STATE', message, 400)
    }
    const { legs, tripType, adults, children, infants } = request
    if (legs.some((leg) => leg.origin === leg.destination)) invalid('Origin and destination must differ')
    if (adults + children < 1 || adults + children > 9 || infants > adults) invalid('Invalid passenger party')
    if (tripType === 'one_way' && legs.length !== 1) invalid('One-way search requires one leg')
    if (tripType === 'return') {
      if (legs.length !== 2) invalid('Return search requires two legs')
      if (legs[1].origin !== legs[0].destination || legs[1].destination !== legs[0].origin || legs[1].date < legs[0].date) {
        invalid('Return leg must reverse the outbound route and cannot precede it')
      }
    }
    if (tripType === 'multi_city' && (legs.length < 2 || legs.length > 5)) invalid('Multi-city search requires two to five legs')
  }
}
