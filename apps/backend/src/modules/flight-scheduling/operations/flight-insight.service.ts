import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { parseLimit, UUID } from '../pagination'

// Feature 4 keeps the base currency; this is the fallback while it has not set one.
const DEFAULT_BASE_CURRENCY = 'THB'

const NOT_CONNECTED = [
  'bookings: not connected yet',
  'crew: not connected yet',
  'bags: no feature publishes baggage counts yet',
  'cargo: no feature publishes cargo counts yet',
]

export interface CostLine {
  item: string
  basis: string
  amount: number
  currency: string
  /** The amount in the base currency, or null when there is no exchange rate for `currency`. */
  amount_in_base?: number | null
}

/** Read-only views of one flight for the staff screens: what it costs to fly, and who a disruption would touch. */
@Injectable()
export class FlightInsightService {
  constructor(private readonly db: DbService) {}

  /**
   * What the flight costs to operate from the data Feature 2 can reach: the aircraft type's operating cost for the block time
   * (Feature 9) and the airport fees in force on the service date, departure fees at the origin and arrival fees at the destination.
   * Revenue (seats sold from Feature 3b, fares from Feature 4) and the planned ground time are not available, so they are listed in
   * `pending` instead of being guessed. Every line is also shown in the base currency (Feature 4's `base_currency` setting, THB when it is
   * not set), converted with Feature 4's currency table; the total is left out while a line has no exchange rate.
   * ponytail: a per-tonne fee uses the type's maximum take-off weight.
   */
  async costEstimate(flightId: string) {
    if (!UUID.test(flightId)) throw new NotFoundException('Flight not found')
    const flight = await this.db.flight.findUnique({
      where: { id: flightId },
      select: {
        id: true,
        flight_number: true,
        service_date: true,
        actual_destination: true,
        route: { select: { origin: true, destination: true, block_time_min: true } },
        aircraft: {
          select: { aircraft_type: { select: { operating_cost_per_hour: true, cost_currency: true, max_takeoff_weight_kg: true } } },
        },
      },
    })
    if (!flight) throw new NotFoundException('Flight not found')

    const destination = flight.actual_destination ?? flight.route.destination
    const fees = await this.db.airport_fee.findMany({
      where: {
        effective_from: { lte: flight.service_date },
        OR: [{ effective_to: null }, { effective_to: { gte: flight.service_date } }],
        AND: [
          {
            OR: [
              { airport: flight.route.origin, applies_on: 'departure' },
              { airport: destination, applies_on: 'arrival' },
            ],
          },
        ],
      },
      orderBy: [{ airport: 'asc' }, { fee_type: 'asc' }],
    })

    const type = flight.aircraft.aircraft_type
    const blockHours = flight.route.block_time_min / 60
    const lines: CostLine[] = [
      {
        item: 'Operating cost',
        basis: `${blockHours.toFixed(2)} block hours at ${Number(type.operating_cost_per_hour)} per hour`,
        amount: round(blockHours * Number(type.operating_cost_per_hour)),
        currency: type.cost_currency,
      },
    ]
    const pending = ['revenue: seats sold and fares are not connected yet']
    for (const fee of fees) {
      const item = `${fee.airport} ${fee.fee_type} fee, ${fee.applies_on}`
      const amount = Number(fee.amount)
      if (fee.unit === 'per_flight') {
        lines.push({ item, basis: `${amount} per flight`, amount, currency: fee.currency })
      } else if (fee.unit === 'per_tonne') {
        const tonnes = type.max_takeoff_weight_kg / 1000
        lines.push({
          item,
          basis: `${amount} per tonne × ${tonnes} t maximum take-off weight`,
          amount: round(amount * tonnes),
          currency: fee.currency,
        })
      } else {
        pending.push(`${item}: charged per hour, and the planned ground time is not available`)
      }
    }

    const baseRow = await this.db.pricing_setting.findUnique({ where: { key: 'base_currency' } })
    const base = baseRow?.value ?? DEFAULT_BASE_CURRENCY
    const foreign = [...new Set(lines.map((l) => l.currency).filter((c) => c !== base))]
    const rates = foreign.length > 0 ? await this.db.currency_rate.findMany({ where: { currency_code: { in: foreign } } }) : []
    // rate_per_base is how many units of the currency one unit of the base buys, so a foreign amount divides by it.
    const perBase = new Map(rates.map((r) => [r.currency_code, Number(r.rate_per_base)]))
    const inBase = (l: CostLine) =>
      l.currency === base ? l.amount : perBase.has(l.currency) ? round(l.amount / (perBase.get(l.currency) as number)) : null
    const converted = lines.map((l) => ({ ...l, amount_in_base: inBase(l) }))
    for (const code of foreign.filter((c) => !perBase.has(c)))
      pending.push(`no exchange rate from ${code} to ${base}, so the total is left out`)
    return {
      flight_id: flight.id,
      flight_number: flight.flight_number,
      block_hours: round(blockHours),
      base_currency: base,
      lines: converted,
      total: converted.every((l) => l.amount_in_base !== null)
        ? { amount: round(converted.reduce((sum, l) => sum + (l.amount_in_base as number), 0)), currency: base }
        : null,
      pending,
    }
  }

  /**
   * Every flight's events, newest first, for the disruption log. `seq` orders them (not the clock), so it is also the cursor: ask for the
   * events older than the last one seen. A category keeps only events whose reason belongs to it; disruptions_only drops the events that
   * have no reason (created, aircraft changed, departed, ...).
   */
  async listEvents(query: EventLogQuery) {
    const limit = parseLimit(query.limit)
    if (query.category !== undefined && !DISRUPTION_CATEGORIES.includes(query.category)) {
      throw new BadRequestException([`category must be one of ${DISRUPTION_CATEGORIES.join(', ')}`])
    }
    if (query.cursor !== undefined && !/^\d+$/.test(query.cursor))
      throw new BadRequestException(['cursor must be an event sequence number'])
    const rows = await this.db.flight_event.findMany({
      where: {
        ...(query.category && { disruption_reason: { category: query.category } }),
        ...(query.disruptions_only === 'true' && !query.category && { disruption_reason_code: { not: null } }),
        ...(query.cursor && { seq: { lt: BigInt(query.cursor) } }),
      },
      orderBy: { seq: 'desc' },
      take: limit + 1,
      include: {
        flight: { select: { flight_number: true, service_date: true, route: { select: { origin: true, destination: true } } } },
        disruption_reason: { select: { category: true, description: true } },
      },
    })
    const page = rows.slice(0, limit)
    return {
      data: page.map((e) => ({
        id: e.id,
        seq: Number(e.seq),
        type: e.type,
        occurred_at: e.occurred_at,
        flight_id: e.flight_id,
        flight_number: e.flight.flight_number,
        service_date: e.flight.service_date.toISOString().slice(0, 10),
        origin: e.flight.route.origin,
        destination: e.flight.route.destination,
        disruption_reason_code: e.disruption_reason_code,
        disruption_category: e.disruption_reason?.category ?? null,
        disruption_reason: e.disruption_reason?.description ?? null,
        delay_minutes: e.delay_minutes,
        hold_minutes: e.hold_minutes,
        new_destination: e.new_destination,
        resolution: e.resolution,
        partner_airline: e.partner_airline,
        note: e.note,
        by: e.actor_id === null ? 'system' : 'staff',
      })),
      nextCursor: rows.length > limit ? String(Number(page[page.length - 1].seq)) : null,
    }
  }

  /**
   * How many bookings, crew, bags and cargo items a disruption of this flight would touch. Those counts belong to other features that
   * publish nothing yet, so this answers 502, the spec's code for another feature being unreachable, with what is missing.
   */
  async impact(flightId: string): Promise<never> {
    if (!UUID.test(flightId)) throw new NotFoundException('Flight not found')
    if (!(await this.db.flight.findUnique({ where: { id: flightId }, select: { id: true } })))
      throw new NotFoundException('Flight not found')
    throw new BadGatewayException({
      message: 'The impact cannot be counted: the features that own these numbers are not connected',
      pending: NOT_CONNECTED,
    })
  }
}

export const DISRUPTION_CATEGORIES = ['weather', 'technical', 'crew', 'air_traffic_control', 'security', 'airport_operations', 'other']

export interface EventLogQuery {
  category?: string
  disruptions_only?: string
  limit?: string
  cursor?: string
}

const round = (n: number) => Math.round(n * 100) / 100
