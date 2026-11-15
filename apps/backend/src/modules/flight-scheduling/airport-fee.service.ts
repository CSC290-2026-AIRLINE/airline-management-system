import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { parseIata } from './dto/airport.dto'
import { parseDate, prismaCode, UUID } from './pagination'

const FEE_TYPES = ['landing', 'parking', 'handling', 'navigation']
const APPLIES_ON = ['departure', 'arrival']
const UNITS = ['per_flight', 'per_hour', 'per_tonne']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

interface FeeRow {
  amount: unknown
  effective_from: Date
  effective_to: Date | null
}

// amount is NUMERIC, which Prisma returns as a Decimal; the API sends a plain number and plain dates.
const view = <T extends FeeRow>(row: T) => ({
  ...row,
  amount: Number(row.amount),
  effective_from: day(row.effective_from),
  effective_to: day(row.effective_to),
})

@Injectable()
export class AirportFeeService {
  constructor(private readonly db: DbService) {}

  async list(query: { airport?: string }) {
    const airport = query.airport === undefined ? undefined : parseIata(query.airport)
    const rows = await this.db.airport_fee.findMany({
      where: { airport },
      orderBy: [{ airport: 'asc' }, { fee_type: 'asc' }, { applies_on: 'asc' }, { effective_from: 'asc' }],
    })
    return { data: rows.map(view), nextCursor: null }
  }

  async create(body: unknown) {
    const input = this.parse(body)
    await this.assertAirport(input.airport)
    await this.assertNoOverlap(input)
    return view(await this.db.airport_fee.create({ data: input }))
  }

  async update(id: string, body: unknown) {
    if (!UUID.test(id)) throw new BadRequestException('id must be a UUID')
    const input = this.parse(body)
    await this.assertAirport(input.airport)
    await this.assertNoOverlap(input, id)
    try {
      // updated_at is audit metadata, so the real clock is fine here.
      return view(await this.db.airport_fee.update({ where: { id }, data: { ...input, updated_at: new Date() } }))
    } catch (e) {
      if (prismaCode(e) === 'P2025') throw new NotFoundException('airport fee not found')
      throw e
    }
  }

  private parse(body: unknown) {
    if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
    const errors: string[] = []
    const oneOf = (key: string, allowed: string[]) => {
      const v = body[key]
      if (typeof v !== 'string' || !allowed.includes(v)) errors.push(`${key} must be one of: ${allowed.join(', ')}`)
      return v as string
    }
    const airport = typeof body.airport === 'string' ? body.airport.trim().toUpperCase() : ''
    if (!/^[A-Z]{3}$/.test(airport)) errors.push('airport must be a 3-letter IATA code')
    const amount = body.amount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) errors.push('amount must be zero or more')
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : ''
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('currency must be a 3-letter code')

    const fee_type = oneOf('fee_type', FEE_TYPES)
    const applies_on = oneOf('applies_on', APPLIES_ON)
    const unit = oneOf('unit', UNITS)

    const date = (key: string, required: boolean) => {
      const v = body[key]
      if (v === undefined || v === null || v === '') {
        if (required) errors.push(`${key} is required`)
        return null
      }
      try {
        return parseDate(typeof v === 'string' ? v : '', key)
      } catch (e) {
        errors.push((e as BadRequestException).message)
        return null
      }
    }
    const effective_from = date('effective_from', true)
    const effective_to = date('effective_to', false)
    if (effective_from && effective_to && effective_to < effective_from) errors.push('effective_to must not be before effective_from')

    if (errors.length) throw new BadRequestException(errors)
    return {
      airport,
      fee_type,
      applies_on,
      amount: amount as number,
      unit,
      currency,
      effective_from: effective_from as Date,
      effective_to,
    }
  }

  private async assertAirport(iata: string) {
    if (!(await this.db.airport.findUnique({ where: { iata_code: iata }, select: { iata_code: true } }))) {
      throw new BadRequestException('airport does not exist')
    }
  }

  // Two fees of the same type and movement at one airport must not be in force on the same day.
  private async assertNoOverlap(input: ReturnType<AirportFeeService['parse']>, ignoreId?: string) {
    const clash = await this.db.airport_fee.findFirst({
      where: {
        id: ignoreId ? { not: ignoreId } : undefined,
        airport: input.airport,
        fee_type: input.fee_type,
        applies_on: input.applies_on,
        ...(input.effective_to && { effective_from: { lte: input.effective_to } }),
        OR: [{ effective_to: null }, { effective_to: { gte: input.effective_from } }],
      },
    })
    if (clash) {
      throw new ConflictException(`a ${input.fee_type} fee on ${input.applies_on} at ${input.airport} already covers those dates`)
    }
  }
}
