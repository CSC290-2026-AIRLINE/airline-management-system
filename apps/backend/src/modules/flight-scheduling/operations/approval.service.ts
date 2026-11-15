import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { ApprovalRequestInput, RespondInput, ReviseInput } from '../dto/approval.dto'
import { formatLocal } from '../local-time'
import { parseLimit, prismaCode, UUID } from '../pagination'
import { type Decision, decide, type Offer, type SimulatorPolicy } from './approval-simulator'
import { FLIGHT_CLOCK, type FlightClock } from './flight-clock'
import type { Tx } from './flight-event-writer'

const STATUSES = ['pending', 'approved', 'alternative_offered', 'rejected', 'superseded', 'consumed', 'expired']

export interface ListApprovalsQueryDto {
  status?: string
  limit?: string
}

const SELECT = {
  id: true,
  purpose: true,
  flight_id: true,
  route_id: true,
  flight_number: true,
  service_date: true,
  aircraft_id: true,
  proposed_dep_at: true,
  proposed_arr_at: true,
  approver_type: true,
  approver_airport: true,
  approver_partner_airline: true,
  status: true,
  reject_reason: true,
  response_note: true,
  previous_approval_id: true,
  covered_by_approval_id: true,
  revision: true,
  requested_by: true,
  requested_at: true,
  responded_by: true,
  responded_at: true,
  resulting_flight_id: true,
  schedule_approval_offer: { select: { kind: true, starts_at: true, ends_at: true }, orderBy: { starts_at: 'asc' } },
} as const

const view = <T extends { schedule_approval_offer: unknown }>({ schedule_approval_offer, ...row }: T) => ({
  ...row,
  offers: schedule_approval_offer,
})

const offerRow = (approval_id: string, o: Offer) => ({
  approval_id,
  kind: o.ends_at ? 'window' : 'slot',
  starts_at: o.starts_at,
  ...(o.ends_at && { ends_at: o.ends_at }),
})

/** Does an offer already cover this departure? A slot is one exact time, a window runs from starts_at to ends_at inclusive. */
const covers = (o: { starts_at: Date; ends_at: Date | null }, dep: Date) =>
  o.ends_at ? o.starts_at <= dep && dep <= o.ends_at : o.starts_at.getTime() === dep.getTime()

const localDateOf = (at: Date, timeZone: string) => formatLocal(at, timeZone).slice(0, 10)

const minutesOf = (d: Date | null) => (d === null ? null : d.getUTCHours() * 60 + d.getUTCMinutes())

/**
 * Schedule approval requests (Iteration-03 steps "request approval" and the approver's answer). The airport at the route's origin
 * is the approver. In auto mode the simulated approver answers at once; otherwise a staff member answers on the approver console.
 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly db: DbService,
    @Inject(FLIGHT_CLOCK) private readonly clock: FlightClock,
  ) {}

  async list(query: ListApprovalsQueryDto) {
    if (query.status !== undefined && !STATUSES.includes(query.status))
      throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}`)
    const rows = await this.db.schedule_approval.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ requested_at: 'desc' }, { id: 'asc' }],
      take: parseLimit(query.limit),
      select: SELECT,
    })
    return rows.map(view)
  }

  async get(id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Approval not found')
    const row = await this.db.schedule_approval.findUnique({ where: { id }, select: SELECT })
    if (!row) throw new NotFoundException('Approval not found')
    return view(row)
  }

  /** Revision 1 of a request. The new flight or the reschedule is a snapshot here; nothing is saved to the flight until confirm. */
  async create(input: ApprovalRequestInput, actorId: string) {
    const route = await this.db.route.findUnique({
      where: { id: input.route_id },
      select: {
        is_active: true,
        origin: true,
        airport_route_originToairport: { select: { timezone: true, is_active: true } },
      },
    })
    if (!route?.is_active) throw new UnprocessableEntityException('Route is unknown or not active')
    if (!route.airport_route_originToairport.is_active) throw new UnprocessableEntityException(`Airport ${route.origin} is not active`)
    const serviceDate = input.service_date.toISOString().slice(0, 10)
    if (input.flight_id) {
      // A reschedule keeps the flight's service date, even when the new departure falls on another local day.
      const flight = await this.db.flight.findUnique({
        where: { id: input.flight_id },
        select: { flight_number: true, route_id: true, service_date: true },
      })
      if (!flight) throw new UnprocessableEntityException('flight_id does not match a flight')
      if (flight.flight_number !== input.flight_number || flight.route_id !== input.route_id) {
        throw new UnprocessableEntityException('flight_number and route_id must be those of the flight being rescheduled')
      }
      const flightDate = flight.service_date.toISOString().slice(0, 10)
      if (serviceDate !== flightDate)
        throw new UnprocessableEntityException(`service_date must be ${flightDate}, the flight's service date`)
    } else {
      const localDate = localDateOf(input.dep_at, route.airport_route_originToairport.timezone)
      if (localDate !== serviceDate) {
        throw new UnprocessableEntityException(`service_date must be ${localDate}, the departure's local date at ${route.origin}`)
      }
    }

    const id = await this.db
      .$transaction(async (tx) => {
        const row = await tx.schedule_approval.create({
          data: {
            purpose: input.purpose,
            flight_id: input.flight_id ?? null,
            pattern_id: input.pattern_id ?? null,
            route_id: input.route_id,
            flight_number: input.flight_number,
            service_date: input.service_date,
            aircraft_id: input.aircraft_id,
            proposed_dep_at: input.dep_at,
            proposed_arr_at: input.arr_at,
            approver_type: 'airport',
            approver_airport: route.origin,
            requested_by: actorId,
            requested_at: this.clock.now(),
          },
          select: { id: true },
        })
        await this.answerIfAuto(tx, row.id, route.origin, route.airport_route_originToairport.timezone, input.dep_at, input.flight_id)
        return row.id
      })
      .catch((e: unknown) => {
        throw mapApprovalError(e)
      })
    return this.get(id)
  }

  /** The approver's answer to a pending request. */
  async respond(id: string, input: RespondInput, actorId: string) {
    await this.get(id) // 404
    await this.db
      .$transaction(async (tx) => {
        const now = this.clock.now()
        const answer = {
          responded_by: actorId,
          responded_at: now,
          response_note: input.note ?? null,
          updated_at: new Date(),
        }
        const data =
          input.answer === 'approve'
            ? { ...answer, status: 'approved' }
            : input.answer === 'reject'
              ? { ...answer, status: 'rejected', reject_reason: input.reject_reason }
              : { ...answer, status: 'alternative_offered' }
        const updated = await tx.schedule_approval.updateMany({ where: { id, status: 'pending' }, data })
        if (updated.count === 0) throw new ConflictException('The request is no longer pending')
        if (input.answer === 'offer') await tx.schedule_approval_offer.createMany({ data: input.offers.map((o) => offerRow(id, o)) })
      })
      .catch((e: unknown) => {
        throw mapApprovalError(e)
      })
    return this.get(id)
  }

  /**
   * A new request after an offer or a rejection. The offer it replaces becomes superseded; if an earlier offer already covers the
   * new time, the new request is approved at once with covered_by_approval_id and gets no new answer.
   */
  async revise(id: string, input: ReviseInput, actorId: string) {
    const newId = await this.db
      .$transaction(async (tx) => {
        const prev = await tx.schedule_approval.findUnique({
          where: { id },
          include: {
            schedule_approval_offer: true,
            route: { select: { origin: true, airport_route_originToairport: { select: { timezone: true } } } },
          },
        })
        if (!prev) throw new NotFoundException('Approval not found')
        if (prev.status !== 'alternative_offered' && prev.status !== 'rejected') {
          throw new ConflictException(`Only an offered or rejected request can be revised, this one is ${prev.status}`)
        }
        const aircraft_id = input.aircraft_id ?? prev.aircraft_id
        // A new flight's service date is its departure's local date, so an offer on the next local day moves the date with it.
        // A reschedule keeps the flight's service date.
        const service_date =
          prev.purpose === 'new_flight'
            ? new Date(localDateOf(input.dep_at, prev.route.airport_route_originToairport.timezone))
            : prev.service_date
        const covered =
          prev.status === 'alternative_offered' &&
          aircraft_id === prev.aircraft_id &&
          prev.schedule_approval_offer.some((o) => covers(o, input.dep_at))

        // The live request has to leave first: only one live request may exist per flight number and date.
        if (prev.status === 'alternative_offered') {
          await tx.schedule_approval.update({ where: { id }, data: { status: 'superseded', updated_at: new Date() } })
        }
        const next = await tx.schedule_approval.create({
          data: {
            purpose: prev.purpose,
            flight_id: prev.flight_id,
            pattern_id: prev.pattern_id,
            route_id: prev.route_id,
            flight_number: prev.flight_number,
            service_date,
            aircraft_id,
            proposed_dep_at: input.dep_at,
            proposed_arr_at: input.arr_at,
            approver_type: prev.approver_type,
            approver_airport: prev.approver_airport,
            approver_partner_airline: prev.approver_partner_airline,
            revision: prev.revision + 1,
            previous_approval_id: prev.id,
            requested_by: actorId,
            requested_at: this.clock.now(),
            ...(covered && { status: 'approved', covered_by_approval_id: prev.id }),
          },
          select: { id: true },
        })
        if (!covered) {
          await this.answerIfAuto(
            tx,
            next.id,
            prev.route.origin,
            prev.route.airport_route_originToairport.timezone,
            input.dep_at,
            prev.flight_id ?? undefined,
          )
        }
        return next.id
      })
      .catch((e: unknown) => {
        throw mapApprovalError(e)
      })
    return this.get(newId)
  }

  /** In auto mode with no response delay the simulated approver answers straight away; otherwise the request stays pending. */
  private async answerIfAuto(tx: Tx, id: string, origin: string, timeZone: string, dep: Date, flightId?: string) {
    const settings = await tx.flight_setting.findMany({ where: { key: { in: ['approval_mode', 'approval_response_delay_minutes'] } } })
    const value = (key: string, fallback: string) => settings.find((s) => s.key === key)?.value ?? fallback
    if (value('approval_mode', 'auto') !== 'auto' || Number(value('approval_response_delay_minutes', '0')) > 0) return

    const policyRow = await tx.airport_approval_policy.findUnique({ where: { airport: origin } })
    const policy: SimulatorPolicy = {
      curfewStartMin: minutesOf(policyRow?.curfew_start_local ?? null),
      curfewEndMin: minutesOf(policyRow?.curfew_end_local ?? null),
      maxPerHour: policyRow?.max_departure_per_hour ?? null,
      offerStyle: policyRow?.offer_style === 'window' ? 'window' : 'slots',
    }
    // Other departures from this airport from an hour before to 25 hours after the request, which is the simulator's search range.
    const around = await tx.flight.findMany({
      where: {
        route: { origin },
        status: { not: 'cancelled' },
        dep_at: { gte: new Date(dep.getTime() - 3_600_000), lte: new Date(dep.getTime() + 25 * 3_600_000) },
        ...(flightId && { id: { not: flightId } }),
      },
      select: { dep_at: true },
    })
    const decision = decide(
      policy,
      dep,
      timeZone,
      around.map((f) => f.dep_at),
    )
    await this.apply(tx, id, decision)
  }

  private async apply(tx: Tx, id: string, decision: Decision) {
    const base = { responded_at: this.clock.now(), responded_by: null, updated_at: new Date() }
    if (decision.status === 'approved') {
      await tx.schedule_approval.update({ where: { id }, data: { ...base, status: 'approved' } })
    } else if (decision.status === 'rejected') {
      await tx.schedule_approval.update({
        where: { id },
        data: { ...base, status: 'rejected', reject_reason: decision.reason, response_note: decision.note },
      })
    } else {
      await tx.schedule_approval.update({ where: { id }, data: { ...base, status: 'alternative_offered', response_note: decision.note } })
      await tx.schedule_approval_offer.createMany({ data: decision.offers.map((o) => offerRow(id, o)) })
    }
  }
}

function mapApprovalError(e: unknown): unknown {
  if (prismaCode(e) === 'P2002') return new ConflictException('A live approval request already exists for this flight number and date')
  if (prismaCode(e) === 'P2003') return new UnprocessableEntityException('A referenced aircraft, route, flight or airport does not exist')
  return e
}
