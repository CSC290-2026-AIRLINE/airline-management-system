import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { ListAirportsQueryDto, parseAirportBody, parseIata } from './dto/airport.dto'
import { parseLimit, prismaCode } from './pagination'

@Injectable()
export class AirportService {
  constructor(private readonly db: DbService) {}

  async list(query: ListAirportsQueryDto) {
    const { q, country, is_active } = query
    if (is_active !== undefined && is_active !== 'true' && is_active !== 'false') {
      throw new BadRequestException('is_active must be true or false')
    }
    const cursor = query.cursor === undefined ? undefined : parseIata(query.cursor)
    const limit = parseLimit(query.limit)

    // Fetch one extra row to learn whether another page exists.
    const rows = await this.db.airport.findMany({
      where: {
        country: country?.trim() || undefined,
        is_active: is_active === undefined ? undefined : is_active === 'true',
        ...(q?.trim() && {
          OR: [
            { iata_code: { contains: q.trim(), mode: 'insensitive' } },
            { icao_code: { contains: q.trim(), mode: 'insensitive' } },
            { name: { contains: q.trim(), mode: 'insensitive' } },
            { city: { contains: q.trim(), mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { iata_code: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { iata_code: cursor }, skip: 1 }),
    })
    const data = rows.slice(0, limit)
    return { data, nextCursor: rows.length > limit ? data[data.length - 1].iata_code : null }
  }

  async get(rawIata: string) {
    const airport = await this.db.airport.findUnique({ where: { iata_code: parseIata(rawIata) } })
    if (!airport) throw new NotFoundException('airport not found')
    return airport
  }

  async create(body: unknown) {
    const { iata_code, ...rest } = parseAirportBody(body, true)
    try {
      return await this.db.airport.create({ data: { iata_code: iata_code as string, ...rest } })
    } catch (e) {
      if (prismaCode(e) === 'P2002') throw new ConflictException('an airport with this IATA or ICAO code already exists')
      throw e
    }
  }

  async update(rawIata: string, body: unknown) {
    const iata = parseIata(rawIata)
    const { iata_code, ...rest } = parseAirportBody(body, false)
    if (iata_code !== undefined && iata_code !== iata) throw new BadRequestException('iata_code cannot be changed')

    // ponytail: only active routes block deactivation; flights are covered through their route, add a direct check if flights can outlive routes.
    if (rest.is_active === false) {
      const inUse = await this.db.route.count({ where: { is_active: true, OR: [{ origin: iata }, { destination: iata }] } })
      if (inUse > 0) throw new ConflictException(`airport is used by ${inUse} active route(s); deactivate them first`)
    }

    try {
      // updated_at is audit metadata, not a business timestamp, so the real clock is fine here.
      return await this.db.airport.update({ where: { iata_code: iata }, data: { ...rest, updated_at: new Date() } })
    } catch (e) {
      if (prismaCode(e) === 'P2025') throw new NotFoundException('airport not found')
      if (prismaCode(e) === 'P2002') throw new ConflictException('an airport with this ICAO code already exists')
      throw e
    }
  }
}
