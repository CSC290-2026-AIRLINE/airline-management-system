// Routes controller. Tiny shim: lists every route in the network with
// origin/destination airport and city. Used by the staff-web Offered
// menu page; the F12 module didn't ship this endpoint because routes
// are F1's domain. The response is intentionally minimal.

import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { StaffGuard } from '../common/staff.guard'

interface RouteDto {
  id: string
  originAirport: string
  destinationAirport: string
  originCity: string
  destinationCity: string
}

interface RouteFlightDto {
  id: string
  flightNumber: string
  routeId: string
  scheduledDeparture: string
  aircraftId: string
  status: string
}

@UseGuards(StaffGuard)
@Controller('staff/routes')
export class RoutesController {
  constructor(private readonly db: DbService) {}

  @Get()
  async list(): Promise<RouteDto[]> {
    const rows = await this.db.route.findMany({
      include: { airport_route_originToairport: true, airport_route_destinationToairport: true },
    })
    return rows.map((r) => ({
      id: r.id,
      originAirport: r.origin,
      destinationAirport: r.destination,
      originCity: r.airport_route_originToairport?.city ?? r.origin,
      destinationCity: r.airport_route_destinationToairport?.city ?? r.destination,
    }))
  }

  @Get(':routeId')
  async getOne(@Param('routeId') routeId: string): Promise<RouteDto> {
    const r = await this.db.route.findUnique({
      where: { id: routeId },
      include: { airport_route_originToairport: true, airport_route_destinationToairport: true },
    })
    if (!r) throw new NotFoundException('Route not found.')
    return {
      id: r.id,
      originAirport: r.origin,
      destinationAirport: r.destination,
      originCity: r.airport_route_originToairport?.city ?? r.origin,
      destinationCity: r.airport_route_destinationToairport?.city ?? r.destination,
    }
  }

  // Flights on a given route. Returns the minimum shape the staff-web
  // route-detail page needs (id, flightNumber, scheduledDeparture,
  // aircraftId, status). Ordered by scheduledDeparture ascending.
  @Get(':routeId/flights')
  async listFlights(@Param('routeId') routeId: string): Promise<RouteFlightDto[]> {
    const route = await this.db.route.findUnique({ where: { id: routeId } })
    if (!route) throw new NotFoundException('Route not found.')
    const rows = await this.db.flight.findMany({
      where: { route_id: routeId },
      orderBy: { scheduled_dep_at: 'asc' },
    })
    return rows.map((f) => ({
      id: f.id,
      flightNumber: f.flight_number,
      routeId: f.route_id,
      scheduledDeparture: f.scheduled_dep_at.toISOString(),
      aircraftId: f.aircraft_id,
      status: f.status,
    }))
  }
}
