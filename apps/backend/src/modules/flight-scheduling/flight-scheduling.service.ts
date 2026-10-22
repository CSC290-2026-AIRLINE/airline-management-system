import { BadRequestException, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FLIGHT_STATUSES, FlightStatus, ListFlightsQueryDto } from './dto/list-flights-query.dto'
import { parseLimit, UUID } from './pagination'

const DATE = /^\d{4}-\d{2}-\d{2}$/

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

    let date: Date | undefined
    if (service_date !== undefined) {
      date = new Date(`${service_date}T00:00:00Z`)
      if (!DATE.test(service_date) || Number.isNaN(date.getTime())) throw new BadRequestException('service_date must be YYYY-MM-DD')
    }

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
