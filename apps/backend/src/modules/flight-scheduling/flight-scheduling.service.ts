import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FLIGHT_STATUSES, FlightStatus, ListFlightsQueryDto } from './dto/list-flights-query.dto'
import { parseDate, parseLimit, UUID } from './pagination'

@Injectable()
export class FlightSchedulingService {
  constructor(private readonly db: DbService) {}

  async listFlights(query: ListFlightsQueryDto) {
    const { status, route_id, service_date, cursor } = query
    if (status !== undefined && !FLIGHT_STATUSES.includes(status as FlightStatus)) {
      throw new BadRequestException(`status must be one of: ${FLIGHT_STATUSES.join(', ')}`)
    }
    if (route_id !== undefined && !UUID.test(route_id)) throw new BadRequestException('route_id must be a UUID')
    if (cursor !== undefined && !UUID.test(cursor)) throw new BadRequestException('cursor must be a UUID')

    const date = service_date === undefined ? undefined : parseDate(service_date, 'service_date')

    const limit = parseLimit(query.limit)

    // Fetch one extra row to learn whether another page exists.
    const rows = await this.db.flight.findMany({
      where: { status, route_id, service_date: date },
      orderBy: [{ dep_at: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })
    const data = rows.slice(0, limit)
    return { data, nextCursor: rows.length > limit ? data[data.length - 1].id : null }
  }

  // One flight with its route and airports, for the features that read the schedule.
  async getFlight(id: string) {
    if (!UUID.test(id)) throw new BadRequestException('id must be a UUID')
    const flight = await this.db.flight.findUnique({ where: { id }, include: { route: true } })
    if (!flight) throw new NotFoundException('flight not found')

    const { route, ...row } = flight
    const airports = await this.db.airport.findMany({
      where: { iata_code: { in: [route.origin, route.destination] } },
      select: { iata_code: true, name: true, city: true, country: true, timezone: true },
    })
    const airport = (code: string) => airports.find((a) => a.iata_code === code) ?? null

    return {
      ...row,
      // A diversion lands somewhere other than the planned destination.
      effective_destination: row.actual_destination ?? route.destination,
      // Total delay is the current expected time against the published timetable, not a sum of events.
      delay_minutes: Math.round((row.dep_at.getTime() - row.scheduled_dep_at.getTime()) / 60000),
      route: {
        id: route.id,
        distance_km: route.distance_km,
        block_time_min: route.block_time_min,
        origin: airport(route.origin),
        destination: airport(route.destination),
      },
    }
  }
}
