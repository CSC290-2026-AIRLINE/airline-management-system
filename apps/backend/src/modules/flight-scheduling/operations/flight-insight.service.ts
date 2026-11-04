import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { UUID } from '../pagination'

const NOT_CONNECTED = [
  'bookings: Feature 3b has no API yet',
  'crew: Feature 8 has no API yet',
  'bags: no feature publishes baggage counts yet',
  'cargo: no feature publishes cargo counts yet',
]

export interface CostLine {
  item: string
  basis: string
  amount: number
  currency: string
}

/** Read-only views of one flight for the staff screens: what it costs to fly, and who a disruption would touch. */
@Injectable()
export class FlightInsightService {
  constructor(private readonly db: DbService) {}

  /**
   * What the flight costs to operate from the data Feature 2 can reach: the aircraft type's operating cost for the block time
   * (Feature 9) and the airport fees in force on the service date, departure fees at the origin and arrival fees at the destination.
   * Revenue (seats sold from Feature 3b, fares from Feature 4) and the planned ground time are not available, so they are listed in
   * `pending` instead of being guessed. The total is left out when the lines are in more than one currency.
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
        basis: `${blockHours.toFixed(2)} block hours at ${Number(type.operating_cost_per_hour)} per hour (Feature 9)`,
        amount: round(blockHours * Number(type.operating_cost_per_hour)),
        currency: type.cost_currency,
      },
    ]
    const pending = ['revenue: seats sold (Feature 3b) and fares (Feature 4) are not connected']
    for (const fee of fees) {
      const item = `${fee.airport} ${fee.fee_type} fee, ${fee.applies_on}`
      const amount = Number(fee.amount)
      if (fee.unit === 'per_flight') {
        lines.push({ item, basis: `${amount} per flight`, amount, currency: fee.currency })
      } else if (fee.unit === 'per_tonne') {
        const tonnes = type.max_takeoff_weight_kg / 1000
        lines.push({
          item,
          basis: `${amount} per tonne × ${tonnes} t maximum take-off weight (Feature 9)`,
          amount: round(amount * tonnes),
          currency: fee.currency,
        })
      } else {
        pending.push(`${item}: charged per hour, and the planned ground time is not available`)
      }
    }

    const currencies = new Set(lines.map((l) => l.currency))
    return {
      flight_id: flight.id,
      flight_number: flight.flight_number,
      block_hours: round(blockHours),
      lines,
      total: currencies.size === 1 ? { amount: round(lines.reduce((sum, l) => sum + l.amount, 0)), currency: [...currencies][0] } : null,
      pending,
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

const round = (n: number) => Math.round(n * 100) / 100
