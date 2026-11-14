import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type {
  check_inWhereInput,
  checked_bagUncheckedUpdateInput,
  flight_boardingUncheckedUpdateInput,
  travel_documentUncheckedUpdateInput,
} from '../../../db/generated/prisma/models'
import { invalidState, notFound } from '../errors'
import { CLOCK } from '../providers/providers'
import type { ClockProvider } from '../providers/providers'
import type { CheckInRepository } from './checkin-repository'
import type {
  BoardingEventRecord,
  BoardingPassRecord,
  CarryOnCheckRecord,
  CheckedBagRecord,
  CheckInPatch,
  CheckInRecord,
  CreateBagInput,
  CreateCheckInInput,
  CreateDocumentInput,
  CreatePassInput,
  FlightBoardingRecord,
  GateRecord,
  TravelDocumentRecord,
  UpdateBagPatch,
  UpdateDocumentPatch,
  UpdateFlightBoardingPatch,
  UpdatePassPatch,
  UpsertCarryOnCheckInput,
} from './checkin-store'
import {
  fromBagPatch,
  fromDocumentInput,
  fromDocumentPatch,
  toBagRecord,
  toCarryOnRecord,
  toCheckInRecord,
  toDocumentRecord,
  toEventRecord,
  toFlightBoardingRecord,
  toGateRecord,
  toPassRecord,
} from './prisma-mappers'

/** Prisma's error codes: a unique constraint and a row that is not there. */
const isUniqueViolation = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'P2002'
const isMissingRow = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'P2025'

/**
 * The feature 6 tables in PostgreSQL. Same contract as the in-memory store, so the services do not care which one
 * they got: every row goes through DbService and comes back as a record of the store.
 */
@Injectable()
export class PrismaCheckInRepository implements CheckInRepository {
  constructor(
    private readonly db: DbService,
    @Inject(CLOCK) private readonly clock: ClockProvider,
  ) {}

  async createCheckIn(input: CreateCheckInInput): Promise<CheckInRecord> {
    const row = await this.db.check_in.create({
      data: {
        booking_passenger_id: input.booking_passenger_id,
        passenger_id: input.passenger_id,
        flight_id: input.flight_id,
        status: input.status ?? 'started',
        declared_bags: input.declared_bags ?? null,
        screening_run_id: input.screening_run_id ?? null,
        checked_in_at: input.checked_in_at ?? null,
      },
    })
    return toCheckInRecord(row)
  }

  async getCheckIn(id: string): Promise<CheckInRecord | null> {
    const row = await this.db.check_in.findUnique({ where: { id } })
    return row ? toCheckInRecord(row) : null
  }

  async updateCheckIn(id: string, patch: CheckInPatch): Promise<CheckInRecord> {
    const row = await this.write('Check-in', () =>
      this.db.check_in.update({ where: { id }, data: { ...patch, updated_at: this.clock.now() } }),
    )
    return toCheckInRecord(row)
  }

  /** A check-in is cancelled, never deleted. */
  async cancelCheckIn(id: string): Promise<CheckInRecord> {
    return this.updateCheckIn(id, { status: 'cancelled' })
  }

  async findActiveCheckInByBookingPassenger(bookingPassengerId: string): Promise<CheckInRecord | null> {
    const row = await this.db.check_in.findFirst({
      where: { booking_passenger_id: bookingPassengerId, status: { not: 'cancelled' } },
    })
    return row ? toCheckInRecord(row) : null
  }

  async listCheckIns(): Promise<CheckInRecord[]> {
    return (await this.db.check_in.findMany({ orderBy: { created_at: 'asc' } })).map(toCheckInRecord)
  }

  async listCheckInsByFlight(flightId: string): Promise<CheckInRecord[]> {
    return (await this.db.check_in.findMany({ where: { flight_id: flightId }, orderBy: { created_at: 'asc' } })).map(toCheckInRecord)
  }

  /**
   * The check-ins of a flight. The pnr belongs to the booking and the name to the passenger, so both are read
   * through the relations: the coupon of the check-in carries the booking, the check-in carries the passenger.
   */
  async searchCheckIns(query: { flightId?: string; pnr?: string; name?: string }): Promise<CheckInRecord[]> {
    return (await this.db.check_in.findMany({ where: this.searchWhere(query), orderBy: { created_at: 'asc' } })).map(toCheckInRecord)
  }

  /** The counter searches a flight, a booking ref or a name; every word of the name has to be in the passenger. */
  private searchWhere(query: { flightId?: string; pnr?: string; name?: string }): check_inWhereInput {
    const where: check_inWhereInput = {}
    if (query.flightId) where.flight_id = query.flightId
    if (query.pnr) {
      where.booking_coupon = {
        booking_passenger: { booking: { booking_reference: { contains: query.pnr, mode: 'insensitive' } } },
      }
    }
    const words = (query.name ?? '').split(/\s+/).filter(Boolean)
    if (words.length) {
      where.AND = words.map((word): check_inWhereInput => ({
        passenger: {
          OR: [{ first_name: { contains: word, mode: 'insensitive' } }, { last_name: { contains: word, mode: 'insensitive' } }],
        },
      }))
    }
    return where
  }

  async createDocument(input: CreateDocumentInput): Promise<TravelDocumentRecord> {
    const row = await this.db.travel_document.create({ data: fromDocumentInput(input) })
    return toDocumentRecord(row)
  }

  async getDocument(id: string): Promise<TravelDocumentRecord | null> {
    const row = await this.db.travel_document.findUnique({ where: { id } })
    return row ? toDocumentRecord(row) : null
  }

  async getDocumentByCheckIn(checkInId: string): Promise<TravelDocumentRecord | null> {
    const row = await this.db.travel_document.findUnique({ where: { check_in_id: checkInId } })
    return row ? toDocumentRecord(row) : null
  }

  async listDocuments(): Promise<TravelDocumentRecord[]> {
    return (await this.db.travel_document.findMany({ orderBy: { created_at: 'asc' } })).map(toDocumentRecord)
  }

  async updateDocument(id: string, patch: UpdateDocumentPatch): Promise<TravelDocumentRecord> {
    const data: travel_documentUncheckedUpdateInput = { ...fromDocumentPatch(patch), updated_at: this.clock.now() }
    const row = await this.write('Travel document', () => this.db.travel_document.update({ where: { id }, data }))
    return toDocumentRecord(row)
  }

  async createBag(input: CreateBagInput): Promise<CheckedBagRecord> {
    const row = await this.db.checked_bag.create({
      data: {
        check_in_id: input.check_in_id,
        tag_number: input.tag_number ?? null,
        weight_kg: input.weight_kg,
        excess_kg: input.excess_kg,
        rate_per_kg: input.rate_per_kg,
        excess_fee: input.excess_fee,
        excess_payment_id: input.excess_payment_id ?? null,
        status: input.status ?? 'weighed',
        // The column is NOT NULL: the counter always weighs a bag with a staff member.
        weighed_by: input.weighed_by as string,
        weighed_at: this.clock.now(),
      },
    })
    return toBagRecord(row)
  }

  /** A removed bag is gone: the soft-deleted row is not a bag any more. */
  async getBag(id: string): Promise<CheckedBagRecord | null> {
    const row = await this.db.checked_bag.findFirst({ where: { id, deleted_at: null } })
    return row ? toBagRecord(row) : null
  }

  async listBags(checkInId: string): Promise<CheckedBagRecord[]> {
    return (
      await this.db.checked_bag.findMany({
        where: { check_in_id: checkInId, deleted_at: null },
        // The counter weighs the bags one by one and recomputes the excess over them in that order.
        orderBy: { created_at: 'asc' },
      })
    ).map(toBagRecord)
  }

  /** Feature 10 looks a bag up by the number on its tag. */
  async findBagByTag(tagNumber: string): Promise<CheckedBagRecord | null> {
    const row = await this.db.checked_bag.findFirst({ where: { tag_number: tagNumber, deleted_at: null } })
    return row ? toBagRecord(row) : null
  }

  async updateBag(id: string, patch: UpdateBagPatch): Promise<CheckedBagRecord> {
    const data: checked_bagUncheckedUpdateInput = { ...fromBagPatch(patch), updated_at: this.clock.now() }
    const row = await this.write('Bag', () => this.db.checked_bag.update({ where: { id }, data }))
    return toBagRecord(row)
  }

  /** Soft delete: a tagged bag is never removed, the row stays for the audit. */
  async deleteBag(id: string): Promise<CheckedBagRecord> {
    const bag = await this.getBag(id)
    if (!bag) throw notFound('Bag')
    if (bag.tag_number !== null || bag.status !== 'weighed') {
      throw invalidState('Only a weighed bag without a tag can be removed')
    }
    const now = this.clock.now()
    const row = await this.write('Bag', () => this.db.checked_bag.update({ where: { id }, data: { deleted_at: now, updated_at: now } }))
    return toBagRecord(row)
  }

  async nextBagTagSeq(): Promise<number> {
    const rows = await this.db.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('bag_tag_seq')`
    const value = rows[0]?.nextval
    if (value === undefined || value === null) throw new Error('bag_tag_seq returned no value')
    return Number(value)
  }

  async upsertCarryOnCheck(input: UpsertCarryOnCheckInput): Promise<CarryOnCheckRecord> {
    const data = {
      weight_kg: input.weight_kg,
      within_size: input.within_size,
      result: input.result,
      // The column is NOT NULL: only staff check a carry-on.
      staff_id: input.staff_id as string,
      checked_at: this.clock.now(),
    }
    const existing = await this.db.carry_on_check.findFirst({ where: { check_in_id: input.check_in_id } })
    const row = existing
      ? await this.db.carry_on_check.update({ where: { id: existing.id }, data })
      : await this.db.carry_on_check.create({ data: { ...data, check_in_id: input.check_in_id } })
    return toCarryOnRecord(row)
  }

  async getCarryOnCheck(checkInId: string): Promise<CarryOnCheckRecord | null> {
    const row = await this.db.carry_on_check.findFirst({ where: { check_in_id: checkInId } })
    return row ? toCarryOnRecord(row) : null
  }

  async listGates(): Promise<GateRecord[]> {
    return (await this.db.gate.findMany({ orderBy: { code: 'asc' } })).map(toGateRecord)
  }

  async getGate(id: string): Promise<GateRecord | null> {
    const row = await this.db.gate.findUnique({ where: { id } })
    return row ? toGateRecord(row) : null
  }

  async flightBoarding(flightId: string): Promise<FlightBoardingRecord | null> {
    const row = await this.db.flight_boarding.findUnique({ where: { flight_id: flightId } })
    return row ? toFlightBoardingRecord(row) : null
  }

  async upsertFlightBoarding(flightId: string, gateId: string): Promise<FlightBoardingRecord> {
    const row = await this.db.flight_boarding.upsert({
      where: { flight_id: flightId },
      create: { flight_id: flightId, gate_id: gateId, updated_at: this.clock.now() },
      update: { gate_id: gateId, updated_at: this.clock.now() },
    })
    return toFlightBoardingRecord(row)
  }

  async updateFlightBoarding(flightId: string, patch: UpdateFlightBoardingPatch): Promise<FlightBoardingRecord> {
    const data: flight_boardingUncheckedUpdateInput = { ...patch, updated_at: this.clock.now() }
    const row = await this.write('Flight boarding', () => this.db.flight_boarding.update({ where: { flight_id: flightId }, data }))
    return toFlightBoardingRecord(row)
  }

  async createPass(input: CreatePassInput): Promise<BoardingPassRecord> {
    try {
      const row = await this.db.boarding_pass.create({
        data: {
          check_in_id: input.check_in_id,
          reference: input.reference,
          seat_code: input.seat_code,
          boarding_group: input.boarding_group,
        },
      })
      return toPassRecord(row)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // One pass per check-in: a double submit gets the pass that is already there.
      const [existing] = await this.passesForCheckIn(input.check_in_id)
      if (!existing) throw error
      return existing
    }
  }

  async getPass(id: string): Promise<BoardingPassRecord | null> {
    const row = await this.db.boarding_pass.findUnique({ where: { id } })
    return row ? toPassRecord(row) : null
  }

  async passByReference(reference: string): Promise<BoardingPassRecord | null> {
    const row = await this.db.boarding_pass.findUnique({ where: { reference } })
    return row ? toPassRecord(row) : null
  }

  async passesForCheckIn(checkInId: string): Promise<BoardingPassRecord[]> {
    return (await this.db.boarding_pass.findMany({ where: { check_in_id: checkInId }, orderBy: { created_at: 'asc' } })).map(toPassRecord)
  }

  async listPasses(): Promise<BoardingPassRecord[]> {
    return (await this.db.boarding_pass.findMany({ orderBy: { created_at: 'asc' } })).map(toPassRecord)
  }

  async updatePass(id: string, patch: UpdatePassPatch): Promise<BoardingPassRecord> {
    const row = await this.write('Boarding pass', () =>
      this.db.boarding_pass.update({ where: { id }, data: { ...patch, updated_at: this.clock.now() } }),
    )
    return toPassRecord(row)
  }

  /** The unique index on the final events: a pass boards or no-shows exactly once. */
  async appendEvent(input: Omit<BoardingEventRecord, 'id' | 'created_at'>): Promise<BoardingEventRecord> {
    try {
      const row = await this.db.boarding_event.create({ data: { ...input } })
      return toEventRecord(row)
    } catch (error) {
      if (!isUniqueViolation(error) || (input.event !== 'boarded' && input.event !== 'no_show')) throw error
      // The pass boarded already: the second scan is a rejection, written in its own row.
      const row = await this.db.boarding_event.create({ data: { ...input, event: 'rejected', reason: 'ALREADY_BOARDED' } })
      return toEventRecord(row)
    }
  }

  async listEvents(flightId: string): Promise<BoardingEventRecord[]> {
    return (await this.db.boarding_event.findMany({ where: { flight_id: flightId }, orderBy: { created_at: 'asc' } })).map(toEventRecord)
  }

  async hasFinalEvent(boardingPassId: string): Promise<boolean> {
    const row = await this.db.boarding_event.findFirst({
      where: { boarding_pass_id: boardingPassId, event: { in: ['boarded', 'no_show'] } },
    })
    return row !== null
  }

  /** A row that is not there is a 404, the way the in-memory store answers it. */
  private async write<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (isMissingRow(error)) throw notFound(what)
      throw error
    }
  }
}
