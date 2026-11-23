// FlightContextService: the few facts about a flight that the F12
// rules need — the flight itself, its route, and the warehouse at its
// departure airport.
//
// F2 owns the flight, route and airport tables and has no HTTP API
// yet, so F12 reads them through Prisma behind this port. When F2
// grows an API, this service is the one place that changes.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'

export interface FlightContext {
  id: string
  flightNumber: string
  routeId: string
  scheduledDeparture: Date
  aircraftId: string
  status: string
  origin: string
  destination: string
}

export interface WarehouseContext {
  id: string
  code: string
  name: string
  airportCode: string
}

@Injectable()
export class FlightContextService {
  constructor(private readonly db: DbService) {}

  async getFlight(flightId: string): Promise<FlightContext> {
    const row = await this.db.flight.findUnique({
      where: { id: flightId },
      include: { route: true },
    })
    if (!row) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    return {
      id: row.id,
      flightNumber: row.flight_number,
      routeId: row.route_id,
      scheduledDeparture: row.scheduled_dep_at,
      aircraftId: row.aircraft_id,
      status: row.status,
      origin: row.route.origin,
      destination: row.route.destination,
    }
  }

  // The warehouse at the flight's departure airport. There is one
  // warehouse per departure airport, and a flight whose airport has
  // none cannot be loaded.
  async warehouseForFlight(flightId: string): Promise<WarehouseContext> {
    const flight = await this.getFlight(flightId)
    const warehouse = await this.db.warehouse.findFirst({
      where: { airport_code: flight.origin, deleted_at: null },
    })
    if (!warehouse) {
      throw new ApiErrorException('NO_WAREHOUSE_FOR_AIRPORT', `No warehouse is available at ${flight.origin}.`, 409, {
        airport: flight.origin,
      })
    }
    return { id: warehouse.id, code: warehouse.code, name: warehouse.name, airportCode: warehouse.airport_code }
  }
}
