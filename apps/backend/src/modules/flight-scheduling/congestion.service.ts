import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { parseIata } from './dto/airport.dto'
import { localToUtc } from './local-time'
import { parseDate, prismaCode, UUID } from './pagination'

const HOUR_MS = 60 * 60 * 1000
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

@Injectable()
export class CongestionService {
  constructor(private readonly db: DbService) {}

  // Each window with its busiest hour and the flights in the hours that are over the limit.
  async list(query: { airport?: string }) {
    const airport = query.airport === undefined ? undefined : parseIata(query.airport)
    const windows = await this.db.airport_congestion.findMany({ where: { airport }, orderBy: [{ starts_at: 'desc' }, { id: 'asc' }] })
    const data = await Promise.all(
      windows.map(async (w) => {
        const flights = await this.db.flight.findMany({
          where: {
            status: { not: 'cancelled' },
            OR: [
              { route: { origin: w.airport }, dep_at: { gte: w.starts_at, lt: w.ends_at } },
              { route: { destination: w.airport }, arr_at: { gte: w.starts_at, lt: w.ends_at } },
            ],
          },
          select: { id: true, flight_number: true, service_date: true, dep_at: true, arr_at: true, route: { select: { origin: true } } },
        })
        // One movement per departure from, and per arrival at, the airport inside the window.
        const movements = flights.map((f) => {
          const departs = f.route.origin === w.airport
          return {
            flight_id: f.id,
            flight_number: f.flight_number,
            service_date: f.service_date,
            kind: departs ? 'departs' : 'arrives',
            at: departs ? f.dep_at : f.arr_at,
          }
        })
        // Hours are counted from the window start. ponytail: the last part-hour is not prorated, so a short last hour can read over the limit.
        const perHour = new Map<number, typeof movements>()
        for (const m of movements) {
          const hour = Math.floor((m.at.getTime() - w.starts_at.getTime()) / HOUR_MS)
          perHour.set(hour, [...(perHour.get(hour) ?? []), m])
        }
        const busiest = Math.max(0, ...[...perHour.values()].map((m) => m.length))
        const over = [...perHour.values()].filter((m) => m.length > w.max_movement_per_hour).flat()
        return { ...w, peak_movements: busiest, over_limit: over.sort((a, b) => a.at.getTime() - b.at.getTime()) }
      }),
    )
    return { data, nextCursor: null }
  }

  // The window is given as a local date and times at the airport, which is how staff think of it.
  async create(body: unknown) {
    if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
    const errors: string[] = []
    const text = (key: string) => (typeof body[key] === 'string' ? body[key].trim() : '')
    const iata = text('airport').toUpperCase()
    if (!/^[A-Z]{3}$/.test(iata)) errors.push('airport must be a 3-letter IATA code')
    const date = text('date')
    try {
      parseDate(date, 'date')
    } catch (e) {
      errors.push((e as BadRequestException).message)
    }
    const from = text('from')
    const to = text('to')
    for (const [key, v] of [
      ['from', from],
      ['to', to],
    ])
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) errors.push(`${key} must be HH:MM`)
    const limit = body.max_movement_per_hour
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) errors.push('max_movement_per_hour must be a positive integer')
    const reason = text('disruption_reason_code')
    if (!reason) errors.push('disruption_reason_code is required')
    if (errors.length === 0 && to <= from) errors.push('the window must end after it starts')
    if (errors.length) throw new BadRequestException(errors)

    const airport = await this.db.airport.findUnique({ where: { iata_code: iata }, select: { timezone: true } })
    if (!airport) throw new BadRequestException('airport does not exist')
    if (!(await this.db.disruption_reason.findUnique({ where: { code: reason }, select: { code: true } }))) {
      throw new BadRequestException('disruption_reason_code does not exist')
    }

    const starts_at = localToUtc(date, from, airport.timezone).utc
    const ends_at = localToUtc(date, to, airport.timezone).utc
    const clash = await this.db.airport_congestion.findFirst({
      where: { airport: iata, starts_at: { lt: ends_at }, ends_at: { gt: starts_at } },
    })
    if (clash) throw new ConflictException(`a congestion window at ${iata} already overlaps those times`)

    // created_by stays empty until staff ids are looked up from the token.
    return this.db.airport_congestion.create({
      data: { airport: iata, starts_at, ends_at, max_movement_per_hour: limit as number, disruption_reason_code: reason },
    })
  }

  async remove(id: string) {
    if (!UUID.test(id)) throw new BadRequestException('id must be a UUID')
    try {
      await this.db.airport_congestion.delete({ where: { id } })
    } catch (e) {
      if (prismaCode(e) === 'P2025') throw new NotFoundException('congestion window not found')
      throw e
    }
  }
}
