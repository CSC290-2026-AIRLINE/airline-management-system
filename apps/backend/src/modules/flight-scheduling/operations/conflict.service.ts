import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { DismissInput, ResolveInput } from '../dto/operations.dto'
import { parseLimit, UUID } from '../pagination'
import { AIRCRAFT_DIRECTORY, type AircraftDirectory, F9_NOT_CONNECTED } from './aircraft-directory'
import { AUDIT_SINK, type AuditSink } from './audit-sink'
import { FLIGHT_CLOCK, type FlightClock } from './flight-clock'
import { FlightOperationsService, type OperationResult, PARTNER_ROUTE_MISSING } from './flight-operations.service'
import { APPROVAL_TABLES_MISSING } from './schedule-approvals'

const STATUSES = ['open', 'resolved', 'dismissed', 'superseded']

export interface ListConflictsQueryDto {
  status?: string // default open
  flight_id?: string
  limit?: string
}

export interface ResolutionOption {
  resolution: 'change_aircraft' | 'reschedule' | 'cancel_refund' | 'rebook_partner'
  available: boolean
  /** What staff must supply, and anything this option cannot check yet. */
  needs: string[]
  notes: string[]
  /** Set when a missing table or API makes the option impossible for now. */
  blocked_by?: string
}

const CONFLICT_SELECT = {
  id: true,
  flight_id: true,
  kind: true,
  detail: true,
  facts: true,
  status: true,
  detected_at: true,
  caused_by_event_id: true,
  resolution: true,
  partner_airline: true,
  resolution_event_id: true,
  resolved_by: true,
  resolved_at: true,
  flight: {
    select: {
      flight_number: true,
      status: true,
      aircraft_id: true,
      dep_at: true,
      arr_at: true,
      route: { select: { origin: true, destination: true } },
    },
  },
} as const

/** Staff decide every resolution by hand; nothing here suggests or applies one automatically (spec v2, section 16). */
@Injectable()
export class ConflictService {
  constructor(
    private readonly db: DbService,
    private readonly operations: FlightOperationsService,
    @Inject(AUDIT_SINK) private readonly audit: AuditSink,
    @Inject(AIRCRAFT_DIRECTORY) private readonly aircraft: AircraftDirectory,
    @Inject(FLIGHT_CLOCK) private readonly clock: FlightClock,
  ) {}

  async list(query: ListConflictsQueryDto) {
    const status = query.status ?? 'open'
    if (!STATUSES.includes(status)) throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}`)
    if (query.flight_id !== undefined && !UUID.test(query.flight_id)) throw new BadRequestException('flight_id must be a UUID')
    return this.db.schedule_conflict.findMany({
      where: { status, ...(query.flight_id && { flight_id: query.flight_id }) },
      orderBy: [{ detected_at: 'desc' }, { id: 'asc' }],
      take: parseLimit(query.limit),
      select: CONFLICT_SELECT,
    })
  }

  async get(id: string) {
    if (!UUID.test(id)) throw new BadRequestException('id must be a UUID')
    const conflict = await this.db.schedule_conflict.findUnique({ where: { id }, select: CONFLICT_SELECT })
    if (!conflict) throw new NotFoundException('Conflict not found')
    return conflict
  }

  /**
   * The four resolutions with whether each can be applied now. Options depend on what is actually feasible (Iteration-03);
   * where a dependency is missing the option is unavailable and `blocked_by` says why, instead of being offered unchecked.
   */
  async options(id: string): Promise<{ conflict: Awaited<ReturnType<ConflictService['get']>>; options: ResolutionOption[] }> {
    const conflict = await this.get(id)
    const open = conflict.status === 'open'
    return {
      conflict,
      options: [
        {
          resolution: 'change_aircraft',
          available: open && this.aircraft.connected,
          needs: ['aircraft_id'],
          notes: [],
          ...(!this.aircraft.connected && { blocked_by: F9_NOT_CONNECTED }),
        },
        {
          resolution: 'reschedule',
          available: false,
          needs: ['approval_id', 'dep_at', 'arr_at'],
          notes: [],
          blocked_by: APPROVAL_TABLES_MISSING,
        },
        { resolution: 'cancel_refund', available: open, needs: ['reason_code'], notes: [] },
        {
          resolution: 'rebook_partner',
          available: false,
          needs: ['reason_code', 'partner_airline'],
          notes: [],
          blocked_by: PARTNER_ROUTE_MISSING,
        },
      ],
    }
  }

  /** Applies the chosen fix to the conflict's flight and closes the conflict, in one transaction. */
  async resolve(id: string, input: ResolveInput, actorId: string) {
    const conflict = await this.get(id)
    if (conflict.status !== 'open') throw new ConflictException(`Conflict is already ${conflict.status}`)

    const otherAircraft = input.resolution === 'change_aircraft' ? input.aircraft_id : undefined
    return this.operations.run(
      conflict.flight_id,
      async (tx, flight) => {
        // Re-read under the flight lock: another resolver may have closed it since.
        const current = await tx.schedule_conflict.findUnique({ where: { id }, select: { status: true } })
        if (current?.status !== 'open') throw new ConflictException(`Conflict is already ${current?.status}`)

        let result: OperationResult
        switch (input.resolution) {
          case 'change_aircraft':
            result = await this.operations.applyAircraftChange(tx, flight, input, actorId)
            break
          case 'reschedule':
            result = await this.operations.applyReschedule(tx, flight, input, actorId)
            break
          case 'cancel_refund':
            result = await this.operations.applyCancel(
              tx,
              flight,
              { reason_code: input.reason_code, resolution: 'refund', note: input.note },
              actorId,
            )
            break
          case 'rebook_partner':
            result = await this.operations.applyCancel(
              tx,
              flight,
              { reason_code: input.reason_code, resolution: 'rebook_partner', partner_airline: input.partner_airline, note: input.note },
              actorId,
            )
            break
        }

        // The re-check inside the operation may already have superseded this row; staff's decision is what closes it.
        const resolved = await tx.schedule_conflict.update({
          where: { id },
          data: {
            status: 'resolved',
            resolution: input.resolution,
            partner_airline: input.resolution === 'rebook_partner' ? input.partner_airline : null,
            resolution_event_id: result.event.id,
            resolved_by: actorId,
            resolved_at: this.clock.now(),
            updated_at: new Date(),
          },
          select: CONFLICT_SELECT,
        })
        return { conflict: resolved, ...result }
      },
      otherAircraft,
    )
  }

  /**
   * Closes a conflict without a resolution. The reason lives only in Feature 15's audit entry, so the entry is written before
   * the transaction commits: if it cannot be written, the conflict stays open (Iteration-03, "dismiss ... writes an audit
   * entry").
   */
  async dismiss(id: string, input: DismissInput, actorId: string) {
    const conflict = await this.get(id)
    if (conflict.status !== 'open') throw new ConflictException(`Conflict is already ${conflict.status}`)
    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      const updated = await tx.schedule_conflict.updateMany({
        where: { id, status: 'open' },
        data: { status: 'dismissed', resolved_by: actorId, resolved_at: now, updated_at: new Date() },
      })
      if (updated.count === 0) throw new ConflictException('Conflict was closed by someone else')
      await this.audit.record({ action: 'schedule_conflict.dismissed', entityId: id, actorId, reason: input.reason, occurredAt: now })
    })
    return this.get(id)
  }
}
