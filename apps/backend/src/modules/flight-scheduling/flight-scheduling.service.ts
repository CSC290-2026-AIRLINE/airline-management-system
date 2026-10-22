import { BadRequestException, Injectable } from '@nestjs/common'
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
}
