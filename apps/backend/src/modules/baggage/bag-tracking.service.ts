import { Inject, Injectable } from '@nestjs/common'
import type { bag_location_event } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import type { BagLocation, BagLocationAction, BagLocationEvent, BagTrackingHistory, StaffMoveAction } from './common/bag-location.types'
import { STAFF_MOVE_ACTIONS } from './common/bag-location.types'
import { RECOVERY_CASE_STATUSES, lockFoundBag, lockLostReport } from './common/case-locks'
import type { ReportStatus } from './common/baggage.constants'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import type { FoundBagStatus } from './common/found-bag.types'
import { AIRPORT_CODE_PATTERN, UUID_PATTERN, prismaErrorCode } from './common/patterns'

export interface RecordMoveInput {
  staffId: string
  foundBagId: string
  action: StaffMoveAction
  /** Required for sent: the station the bag goes to. */
  toAirport?: string | null
  /** Optional for sent: the flight the bag flies on. */
  sentOnFlightId?: string | null
  note?: string | null
}

/** A bag in one of these states is done moving: it reached its owner, timed out, or went on with a diverted flight. */
const CLOSED_STATUSES: readonly FoundBagStatus[] = ['delivered', 'unclaimed', 'continued_with_flight']

const EVENT_ORDER = [{ occurred_at: 'asc' as const }, { created_at: 'asc' as const }]

function toEvent(row: bag_location_event): BagLocationEvent {
  return {
    id: row.id,
    foundBagId: row.found_bag_id,
    airportCode: row.airport_code,
    action: row.action as BagLocationAction,
    toAirport: row.to_airport,
    sentOnFlightId: row.sent_on_flight_id,
    note: row.note,
    staffId: row.staff_id,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  }
}

/** The bag's current place is its latest event. A sent event leaves it in transit until someone records arrived. */
export function currentLocation(events: readonly BagLocationEvent[]): BagLocation | null {
  const last = events.at(-1)

  if (!last) {
    return null
  }

  const inTransit = last.action === 'sent'

  return {
    airportCode: last.airportCode,
    inTransit,
    toAirport: inTransit ? last.toAirport : null,
    lastAction: last.action,
    lastEventAt: last.occurredAt,
  }
}

function invalidMove(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_MOVE, message)
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_NOT_FOUND, 'Found bag not found')
}

/**
 * Tracking and movement of found bags between stations (bag_location_event, append-only).
 * Staff record held, sent and arrived by hand; the airport of each event comes from where the bag is, never from the
 * caller, so the trail stays continuous.
 */
@Injectable()
export class BagTrackingService {
  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  async getHistory(foundBagId: string): Promise<BagTrackingHistory> {
    const bag = UUID_PATTERN.test(foundBagId)
      ? await this.db.found_bag.findUnique({ where: { id: foundBagId }, select: { id: true } })
      : null

    if (!bag) {
      throw notFound()
    }

    const rows = await this.db.bag_location_event.findMany({ where: { found_bag_id: foundBagId }, orderBy: EVENT_ORDER })
    const events = rows.map(toEvent)

    return { foundBagId, current: currentLocation(events), events }
  }

  async recordMove(input: RecordMoveInput): Promise<BagTrackingHistory> {
    const { staffId, foundBagId, action } = input
    const toAirport = input.toAirport?.trim().toUpperCase() || null
    const sentOnFlightId = input.sentOnFlightId?.trim() || null
    const note = input.note?.trim() || null

    if (!staffId || !UUID_PATTERN.test(staffId)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Recording staff member is required')
    }

    if (!UUID_PATTERN.test(foundBagId)) {
      throw notFound()
    }

    if (!STAFF_MOVE_ACTIONS.includes(action)) {
      throw invalidMove('Staff can record held, sent or arrived only')
    }

    if (action === 'sent') {
      if (!toAirport || !AIRPORT_CODE_PATTERN.test(toAirport)) {
        throw invalidMove('A sent bag needs a 3-letter destination airport')
      }

      if (sentOnFlightId && !UUID_PATTERN.test(sentOnFlightId)) {
        throw invalidMove('Invalid flight id')
      }
    } else if (toAirport || sentOnFlightId) {
      throw invalidMove('Only a sent bag has a destination airport or flight')
    }

    const caseOfBag = { where: { found_bag_id: foundBagId, status: 'confirmed' }, select: { report_id: true } }
    const owner = await this.db.bag_match.findFirst(caseOfBag)

    try {
      await this.db.$transaction(async (tx) => {
        // Lock the bag so two desks cannot move it at the same time. A bag that belongs to a case is locked after its
        // case, the order every write to a case uses (see case-locks), so a move cannot interleave with a delivery step.
        const ownerCase = owner ? await lockLostReport(tx, owner.report_id) : null

        // A bag on its way back to its owner is sent from Deliveries, which moves the delivery and the case with it.
        // Sending it here would leave the case looking undispatched (and cancellable) while the bag travels.
        if (action === 'sent' && ownerCase && RECOVERY_CASE_STATUSES.includes(ownerCase.status as ReportStatus)) {
          throw invalidMove(`This bag belongs to lost bag case ${ownerCase.case_number}; send it from Deliveries`)
        }

        const locked = await lockFoundBag(tx, foundBagId)

        if (!locked) {
          throw notFound()
        }

        if (CLOSED_STATUSES.includes(locked.status as FoundBagStatus)) {
          throw new FoundBagError(FOUND_BAG_ERROR_CODES.BAG_CLOSED, `A ${locked.status} bag can no longer be moved`)
        }

        // Its case cannot change while the bag is locked; if a match was confirmed just before, start again in order.
        const ownerNow = await tx.bag_match.findFirst(caseOfBag)

        if ((ownerNow?.report_id ?? null) !== (owner?.report_id ?? null)) {
          throw invalidMove('This bag has just been matched with a case; reload and try again')
        }

        const last = await tx.bag_location_event.findFirst({
          where: { found_bag_id: foundBagId },
          orderBy: [{ occurred_at: 'desc' }, { created_at: 'desc' }],
        })

        if (!last) {
          throw invalidMove('This bag has no location yet')
        }

        let airportCode = last.airport_code

        if (action === 'arrived') {
          if (last.action !== 'sent' || !last.to_airport) {
            throw invalidMove('Only a bag in transit can arrive')
          }

          airportCode = last.to_airport
        } else if (last.action === 'sent') {
          throw invalidMove(`This bag is in transit to ${last.to_airport}; record arrived first`)
        } else if (action === 'sent' && toAirport === airportCode) {
          throw invalidMove(`This bag is already at ${airportCode}`)
        }

        await tx.bag_location_event.create({
          data: {
            found_bag_id: foundBagId,
            airport_code: airportCode,
            action,
            to_airport: action === 'sent' ? toAirport : null,
            sent_on_flight_id: action === 'sent' ? sentOnFlightId : null,
            note,
            staff_id: staffId,
            occurred_at: this.clock.now(),
          },
        })
      })
    } catch (e) {
      // Foreign key: the destination airport, flight or staff member does not exist.
      if (prismaErrorCode(e) === 'P2003') {
        throw invalidMove('Unknown airport, flight or staff member')
      }

      throw e
    }

    return this.getHistory(foundBagId)
  }
}
