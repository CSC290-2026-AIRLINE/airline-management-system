import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { parsePreviewBody } from './dto/schedule-builder.dto'
import { formatLocal, localToUtc } from './local-time'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PERIOD_DAYS = 366

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

export interface PlannedFlight {
  service_date: string
  flight_number: string
  scheduled_dep_at: string
  scheduled_arr_at: string
  departure_local: string
  arrival_local: string
  overnight: boolean
  already_exists: boolean
  warnings: string[]
}

@Injectable()
export class ScheduleBuilderService {
  constructor(private readonly db: DbService) {}

  // Read-only: plans the flights a timetable would generate. Nothing is written, and no aircraft is needed yet.
  async preview(body: unknown) {
    const input = parsePreviewBody(body)
    const timetable = await this.db.flight_pattern.findUnique({ where: { id: input.timetable_id } })
    if (!timetable) throw new NotFoundException('timetable not found')
    const route = await this.db.route.findUnique({ where: { id: timetable.route_id } })
    if (!route) throw new NotFoundException('route not found')

    const airports = await this.db.airport.findMany({ where: { iata_code: { in: [route.origin, route.destination] } } })
    const origin = airports.find((a) => a.iata_code === route.origin)
    const destination = airports.find((a) => a.iata_code === route.destination)
    const problems = [
      !route.is_active && `route ${route.origin} -> ${route.destination} is inactive`,
      origin && !origin.is_active && `airport ${origin.iata_code} is inactive`,
      destination && !destination.is_active && `airport ${destination.iata_code} is inactive`,
    ].filter(Boolean)
    if (!origin || !destination) problems.push('route airport does not exist')
    if (problems.length || !origin || !destination) throw new BadRequestException(problems)

    // The requested period is clamped to the timetable's validity.
    const requestedFrom = input.from ?? timetable.valid_from
    const requestedTo = input.to ?? timetable.valid_to
    if ((requestedTo.getTime() - requestedFrom.getTime()) / DAY_MS >= MAX_PERIOD_DAYS) {
      throw new BadRequestException(`period must not exceed ${MAX_PERIOD_DAYS} days`)
    }
    const from = requestedFrom > timetable.valid_from ? requestedFrom : timetable.valid_from
    const to = requestedTo < timetable.valid_to ? requestedTo : timetable.valid_to

    const existing = new Set<string>()
    if (from <= to) {
      const rows = await this.db.flight.findMany({
        where: { flight_number: timetable.flight_number, service_date: { gte: from, lte: to } },
        select: { service_date: true },
      })
      rows.forEach((r) => existing.add(isoDate(r.service_date)))
    }

    const depTime = timetable.dep_time_local.toISOString().slice(11, 16)
    const flights: PlannedFlight[] = []
    for (let day = from.getTime(); day <= to.getTime(); day += DAY_MS) {
      const date = new Date(day)
      const weekday = ((date.getUTCDay() + 6) % 7) + 1 // 1 = Monday ... 7 = Sunday, the origin-local calendar day
      if (!timetable.days_of_week.includes(weekday)) continue

      const serviceDate = isoDate(date)
      const { utc: dep, shifted } = localToUtc(serviceDate, depTime, origin.timezone)
      const arr = new Date(dep.getTime() + route.block_time_min * 60000)
      const departureLocal = formatLocal(dep, origin.timezone)
      const arrivalLocal = formatLocal(arr, destination.timezone)
      const warnings = [
        ...(shifted ? [`departure ${depTime} does not exist on ${serviceDate} in ${origin.timezone} (clock change); moved forward`] : []),
        ...(existing.has(serviceDate) ? ['a flight with this number already exists on this date; it would be skipped'] : []),
      ]
      flights.push({
        service_date: serviceDate,
        flight_number: timetable.flight_number,
        scheduled_dep_at: dep.toISOString(),
        scheduled_arr_at: arr.toISOString(),
        departure_local: departureLocal,
        arrival_local: arrivalLocal,
        overnight: arrivalLocal.slice(0, 10) !== departureLocal.slice(0, 10), // arrives on a later calendar day than it left
        already_exists: existing.has(serviceDate),
        warnings,
      })
    }

    const alreadyExisting = flights.filter((f) => f.already_exists).length
    return {
      timetable_id: timetable.id,
      flight_number: timetable.flight_number,
      route: { id: route.id, origin: route.origin, destination: route.destination, block_time_min: route.block_time_min },
      period: { from: isoDate(from), to: isoDate(to) },
      summary: { total: flights.length, new: flights.length - alreadyExisting, already_exists: alreadyExisting },
      warnings: flights.length === 0 ? ['this timetable produces no flights in the selected period'] : [],
      flights,
    }
  }
}
