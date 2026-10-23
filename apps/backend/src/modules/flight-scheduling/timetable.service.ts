import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { ListTimetablesQueryDto, parseTimetableBody } from './dto/timetable.dto'
import { parseDate, parseLimit, prismaCode, UUID } from './pagination'

type Row = { dep_time_local: Date; valid_from: Date; valid_to: Date; _count?: { flight: number } }

// The API speaks HH:MM and YYYY-MM-DD; Prisma hands back Dates for TIME and DATE columns.
// `generated_flights` is how many flights were generated from the timetable; present when the query counted them.
const view = <T extends Row>({ _count, ...row }: T) => ({
  ...row,
  dep_time_local: row.dep_time_local.toISOString().slice(11, 16),
  valid_from: row.valid_from.toISOString().slice(0, 10),
  valid_to: row.valid_to.toISOString().slice(0, 10),
  ...(_count && { generated_flights: _count.flight }),
})

const withCount = { _count: { select: { flight: true } } } as const

const parseId = (raw: string) => {
  if (!UUID.test(raw)) throw new BadRequestException('id must be a UUID')
  return raw
}

@Injectable()
export class TimetableService {
  constructor(private readonly db: DbService) {}

  async list(query: ListTimetablesQueryDto) {
    const { route_id, flight_number, valid_on } = query
    if (route_id !== undefined) parseId(route_id)
    const cursor = query.cursor === undefined ? undefined : parseId(query.cursor)
    const day = valid_on === undefined ? undefined : parseDate(valid_on, 'valid_on')
    const limit = parseLimit(query.limit)

    // Fetch one extra row to learn whether another page exists.
    const rows = await this.db.flight_pattern.findMany({
      where: {
        route_id,
        flight_number: flight_number?.trim().toUpperCase() || undefined,
        ...(day && { valid_from: { lte: day }, valid_to: { gte: day } }),
      },
      include: withCount,
      orderBy: [{ flight_number: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })
    const data = rows.slice(0, limit)
    return { data: data.map(view), nextCursor: rows.length > limit ? data[data.length - 1].id : null }
  }

  async get(id: string) {
    const timetable = await this.db.flight_pattern.findUnique({ where: { id: parseId(id) }, include: withCount })
    if (!timetable) throw new NotFoundException('timetable not found')
    return view(timetable)
  }

  async create(body: unknown) {
    const input = parseTimetableBody(body)
    await this.assertFlightNumber(input.flight_number)
    await this.assertRouteActive(input.route_id)
    try {
      return view(await this.db.flight_pattern.create({ data: input }))
    } catch (e) {
      if (prismaCode(e) === 'P2002') throw new ConflictException(`flight number ${input.flight_number} is already used by a timetable`)
      throw e
    }
  }

  async update(id: string, body: unknown) {
    const timetableId = parseId(id)
    const input = parseTimetableBody(body)
    const current = await this.db.flight_pattern.findUnique({ where: { id: timetableId } })
    if (!current) throw new NotFoundException('timetable not found')

    const routeChanged = current.route_id !== input.route_id
    const numberChanged = current.flight_number !== input.flight_number
    if (numberChanged) await this.assertFlightNumber(input.flight_number)
    if (routeChanged) await this.assertRouteActive(input.route_id)
    if (routeChanged || numberChanged) {
      const generated = await this.db.flight.count({ where: { pattern_id: timetableId } })
      if (generated > 0)
        throw new ConflictException('route and flight number cannot change once flights were generated from this timetable')
    }

    try {
      // updated_at is audit metadata, not a business timestamp, so the real clock is fine here.
      return view(await this.db.flight_pattern.update({ where: { id: timetableId }, data: { ...input, updated_at: new Date() } }))
    } catch (e) {
      if (prismaCode(e) === 'P2002') throw new ConflictException(`flight number ${input.flight_number} is already used by a timetable`)
      throw e
    }
  }

  // Flight numbers are the airline code from flight_setting plus 1 to 4 digits.
  private async assertFlightNumber(flightNumber: string) {
    const setting = await this.db.flight_setting.findUnique({ where: { key: 'airline_code' } })
    // ponytail: airline_code is not seeded yet, so fall back to any 2-character designator; tighten once the Database Team seeds it.
    const ok = setting
      ? flightNumber.startsWith(setting.value) && /^\d{1,4}$/.test(flightNumber.slice(setting.value.length))
      : /^[A-Z0-9]{2}\d{1,4}$/.test(flightNumber)
    if (!ok) {
      throw new BadRequestException(
        setting
          ? `flight_number must be ${setting.value} followed by 1 to 4 digits`
          : 'flight_number must be a 2-character airline code followed by 1 to 4 digits',
      )
    }
  }

  private async assertRouteActive(routeId: string) {
    const route = await this.db.route.findUnique({ where: { id: routeId } })
    if (!route) throw new BadRequestException('route does not exist')
    if (!route.is_active) throw new BadRequestException('route is inactive')
  }
}
