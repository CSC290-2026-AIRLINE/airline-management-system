import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { parseIata } from './dto/airport.dto'
import { ListRoutesQueryDto, parseRouteBody, RouteInput } from './dto/route.dto'
import { parseLimit, prismaCode, UUID } from './pagination'

// Flights in these states still depend on their route; departed, arrived and cancelled ones are history.
const LIVE_FLIGHT_STATUSES = ['scheduled', 'delayed', 'holding', 'diverted']

const parseId = (raw: string) => {
  if (!UUID.test(raw)) throw new BadRequestException('id must be a UUID')
  return raw
}

type Counted = { _count?: { flight_pattern: number } }

// `pattern_count` is how many timetables use the route; present when the query counted them.
const view = <T extends Counted>({ _count, ...row }: T) => ({ ...row, ...(_count && { pattern_count: _count.flight_pattern }) })

const withCount = { _count: { select: { flight_pattern: true } } } as const

@Injectable()
export class RouteService {
  constructor(private readonly db: DbService) {}

  async list(query: ListRoutesQueryDto) {
    const { is_active } = query
    if (is_active !== undefined && is_active !== 'true' && is_active !== 'false') {
      throw new BadRequestException('is_active must be true or false')
    }
    const origin = query.origin === undefined ? undefined : parseIata(query.origin)
    const destination = query.destination === undefined ? undefined : parseIata(query.destination)
    const cursor = query.cursor === undefined ? undefined : parseId(query.cursor)
    const limit = parseLimit(query.limit)

    // Fetch one extra row to learn whether another page exists.
    const rows = await this.db.route.findMany({
      where: { origin, destination, is_active: is_active === undefined ? undefined : is_active === 'true' },
      include: withCount,
      orderBy: [{ origin: 'asc' }, { destination: 'asc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })
    const data = rows.slice(0, limit)
    return { data: data.map(view), nextCursor: rows.length > limit ? data[data.length - 1].id : null }
  }

  async get(id: string) {
    const route = await this.db.route.findUnique({ where: { id: parseId(id) }, include: withCount })
    if (!route) throw new NotFoundException('route not found')
    return view(route)
  }

  async create(body: unknown) {
    const input = parseRouteBody(body)
    await this.assertAirportsActive(input)
    try {
      return await this.db.route.create({ data: input })
    } catch (e) {
      if (prismaCode(e) === 'P2002') throw new ConflictException(`route ${input.origin} -> ${input.destination} already exists`)
      throw e
    }
  }

  async update(id: string, body: unknown) {
    const routeId = parseId(id)
    const input = parseRouteBody(body)
    const current = await this.db.route.findUnique({ where: { id: routeId } })
    if (!current) throw new NotFoundException('route not found')

    if (current.origin !== input.origin || current.destination !== input.destination) {
      await this.assertAirportsActive(input)
      const [flights, patterns] = await Promise.all([
        this.db.flight.count({ where: { route_id: routeId } }),
        this.db.flight_pattern.count({ where: { route_id: routeId } }),
      ])
      if (flights + patterns > 0) throw new ConflictException('airports cannot change on a route that has flights or timetables')
    }

    // ponytail: only live flights block deactivation; timetables need "still valid today", which needs the F1 simulation clock.
    if (input.is_active === false && current.is_active) {
      const live = await this.db.flight.count({ where: { route_id: routeId, status: { in: LIVE_FLIGHT_STATUSES } } })
      if (live > 0) throw new ConflictException(`route has ${live} scheduled or active flight(s); cancel or finish them first`)
    }

    try {
      // updated_at is audit metadata, not a business timestamp, so the real clock is fine here.
      return await this.db.route.update({ where: { id: routeId }, data: { ...input, updated_at: new Date() } })
    } catch (e) {
      if (prismaCode(e) === 'P2002') throw new ConflictException(`route ${input.origin} -> ${input.destination} already exists`)
      throw e
    }
  }

  // Both ends must exist and be active before a route can use them.
  private async assertAirportsActive({ origin, destination }: Pick<RouteInput, 'origin' | 'destination'>) {
    const airports = await this.db.airport.findMany({ where: { iata_code: { in: [origin, destination] } } })
    const problems = [origin, destination].flatMap((code) => {
      const airport = airports.find((a) => a.iata_code === code)
      if (!airport) return [`airport ${code} does not exist`]
      return airport.is_active ? [] : [`airport ${code} is inactive`]
    })
    if (problems.length) throw new BadRequestException(problems)
  }
}
