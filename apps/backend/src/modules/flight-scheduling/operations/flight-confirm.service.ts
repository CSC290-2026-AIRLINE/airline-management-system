import { ConflictException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { ConfirmInput } from '../dto/operations.dto'
import { formatLocal } from '../local-time'
import { prismaCode } from '../pagination'
import { AircraftFeasibilityService, assertGatesPass } from './aircraft-feasibility.service'
import { FlightEventPublisher } from './flight-event-bus'
import { FlightEventWriter, lockAircraft } from './flight-event-writer'
import { buildFlightEvent } from './flight-events'
import { mapWriteError } from './flight-operations.service'
import { SCHEDULE_APPROVALS, type ScheduleApprovals } from './schedule-approvals'

/**
 * Iteration-03 step 8, Confirm: in one transaction, take the aircraft's advisory lock, run the gates again on that
 * transaction, check the approval still matches, save the flight as scheduled and append flight.created with its outbox
 * row. The event is published only after the commit. A flight that fails a gate is not saved.
 */
@Injectable()
export class FlightConfirmService {
  constructor(
    private readonly db: DbService,
    private readonly feasibility: AircraftFeasibilityService,
    private readonly writer: FlightEventWriter,
    private readonly publisher: FlightEventPublisher,
    @Inject(SCHEDULE_APPROVALS) private readonly approvals: ScheduleApprovals,
  ) {}

  async confirm(input: ConfirmInput, actorId: string) {
    const route = await this.db.route.findUnique({
      where: { id: input.route_id },
      select: {
        is_active: true,
        origin: true,
        destination: true,
        distance_km: true,
        airport_route_originToairport: { select: { timezone: true, is_active: true } },
        airport_route_destinationToairport: { select: { is_active: true } },
      },
    })
    if (!route?.is_active) throw new UnprocessableEntityException('Route is unknown or not active')
    if (!route.airport_route_originToairport.is_active) throw new UnprocessableEntityException(`Airport ${route.origin} is not active`)
    if (!route.airport_route_destinationToairport.is_active) {
      throw new UnprocessableEntityException(`Airport ${route.destination} is not active`)
    }
    // service_date is the local origin date of the original departure and never changes (Iteration-03).
    const localDate = formatLocal(input.scheduled_dep_at, route.airport_route_originToairport.timezone).slice(0, 10)
    if (localDate !== input.service_date.toISOString().slice(0, 10)) {
      throw new UnprocessableEntityException(`service_date must be ${localDate}, the departure's local date at ${route.origin}`)
    }

    const result = await this.db.$transaction(async (tx) => {
      try {
        await lockAircraft(tx, input.aircraft_id)

        const report = await this.feasibility.checkAircraftFeasibility(
          input.aircraft_id,
          {
            flightId: null,
            flightNumber: input.flight_number,
            origin: route.origin,
            destination: route.destination,
            scheduledDepAt: input.scheduled_dep_at,
            depAt: input.scheduled_dep_at,
            arrAt: input.scheduled_arr_at,
            distanceKm: route.distance_km,
          },
          tx,
        )
        assertGatesPass(report, 'A gate failed; the flight was not saved')

        const approval = await this.approvals.consume(tx, {
          approvalId: input.approval_id,
          purpose: 'new_flight',
          flightId: null,
          flightNumber: input.flight_number,
          serviceDate: input.service_date,
          aircraftId: input.aircraft_id,
          depAt: input.scheduled_dep_at,
          arrAt: input.scheduled_arr_at,
        })
        if (!approval.ok) throw new ConflictException({ message: approval.detail, rule: approval.rule })

        const flight = await tx.flight.create({
          data: {
            pattern_id: input.pattern_id ?? null,
            flight_number: input.flight_number,
            service_date: input.service_date,
            route_id: input.route_id,
            scheduled_dep_at: input.scheduled_dep_at,
            scheduled_arr_at: input.scheduled_arr_at,
            dep_at: input.scheduled_dep_at,
            arr_at: input.scheduled_arr_at,
            aircraft_id: input.aircraft_id,
            status: 'scheduled',
          },
        })
        await this.approvals.markConsumed(tx, input.approval_id, flight.id)
        const event = buildFlightEvent({
          type: 'created',
          depAt: input.scheduled_dep_at,
          arrAt: input.scheduled_arr_at,
          aircraftId: input.aircraft_id,
        })
        const row = await this.writer.append(tx, flight.id, event, actorId)
        return {
          flight,
          event: { id: row.id, type: row.type, seq: Number(row.seq), occurred_at: row.occurred_at },
        }
      } catch (e) {
        if (prismaCode(e) === 'P2002') throw new ConflictException('A flight already exists for that number and service date')
        throw mapWriteError(e)
      }
    })

    await this.publisher.publishCommitted([result.event.id])
    return result
  }
}
