// FlightsPort: F2 owns the flight/route/airport/aircraft tables, but
// F2 has not shipped an HTTP API yet. Until it does, F12 reads what it
// needs directly through Prisma. If/when F2 grows a real API, swap
// this port for an HTTP client and the rest of F12 stays unchanged.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'

export interface FlightRow {
  id: string
  flightNumber: string
  routeId: string
  scheduledDepAt: Date
  depAt: Date
  aircraftId: string
  status: string
}

export interface RouteRow {
  id: string
  origin: string
  destination: string
  distanceKm: number
  blockTimeMin: number
}

export interface AirportRow {
  iataCode: string
  city: string
  name: string
  country: string
  timezone: string
}

export interface AircraftRow {
  id: string
  tailNumber: string
  baseAirportCode: string
}

export interface ResolvedFlight extends FlightRow {
  origin: string
  destination: string
  originCity: string
  destinationCity: string
  tailNumber: string
  passengerCount: number
}

export interface FlightsPort {
  getFlight(id: string): Promise<ResolvedFlight | null>
  listFlights(filter?: { status?: string; fromDate?: Date; toDate?: Date }): Promise<FlightRow[]>
  getRoute(id: string): Promise<RouteRow | null>
  listAirports(): Promise<AirportRow[]>
  getAirport(code: string): Promise<AirportRow | null>
  getAircraft(id: string): Promise<AircraftRow | null>
}

@Injectable()
export class FlightsService implements FlightsPort {
  constructor(private readonly db: DbService) {}

  async getFlight(id: string): Promise<ResolvedFlight | null> {
    const row = await this.db.flight.findUnique({
      where: { id },
      include: {
        route: { include: { airport_route_originToairport: true, airport_route_destinationToairport: true } },
        aircraft: true,
      },
    })
    if (!row) return null
    return {
      id: row.id,
      flightNumber: row.flight_number,
      routeId: row.route_id,
      scheduledDepAt: row.scheduled_dep_at,
      depAt: row.dep_at,
      aircraftId: row.aircraft_id,
      status: row.status,
      origin: row.route.origin,
      destination: row.route.destination,
      originCity: row.route.airport_route_originToairport.city,
      destinationCity: row.route.airport_route_destinationToairport.city,
      tailNumber: row.aircraft.tail_number,
      passengerCount: 0, // F2 has no passenger count table; surfaced as 0 for the UI.
    }
  }

  async listFlights(filter?: { status?: string; fromDate?: Date; toDate?: Date }): Promise<FlightRow[]> {
    const rows = await this.db.flight.findMany({
      where: {
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.fromDate || filter?.toDate
          ? { scheduled_dep_at: { ...(filter.fromDate ? { gte: filter.fromDate } : {}), ...(filter.toDate ? { lte: filter.toDate } : {}) } }
          : {}),
      },
      orderBy: { scheduled_dep_at: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      flightNumber: r.flight_number,
      routeId: r.route_id,
      scheduledDepAt: r.scheduled_dep_at,
      depAt: r.dep_at,
      aircraftId: r.aircraft_id,
      status: r.status,
    }))
  }

  async getRoute(id: string): Promise<RouteRow | null> {
    const row = await this.db.route.findUnique({ where: { id } })
    if (!row) return null
    return {
      id: row.id,
      origin: row.origin,
      destination: row.destination,
      distanceKm: row.distance_km,
      blockTimeMin: row.block_time_min,
    }
  }

  async listAirports(): Promise<AirportRow[]> {
    const rows = await this.db.airport.findMany({ orderBy: { iata_code: 'asc' } })
    return rows.map((r) => ({
      iataCode: r.iata_code,
      city: r.city,
      name: r.name,
      country: r.country,
      timezone: r.timezone,
    }))
  }

  async getAirport(code: string): Promise<AirportRow | null> {
    const row = await this.db.airport.findUnique({ where: { iata_code: code } })
    if (!row) return null
    return { iataCode: row.iata_code, city: row.city, name: row.name, country: row.country, timezone: row.timezone }
  }

  async getAircraft(id: string): Promise<AircraftRow | null> {
    const row = await this.db.aircraft.findUnique({ where: { id } })
    if (!row) return null
    return { id: row.id, tailNumber: row.tail_number, baseAirportCode: row.base_airport_code }
  }
}
