import { Inject, Injectable, Optional } from '@nestjs/common'
import type { CheckInStatus } from '../api-types'
import { boardingGroup } from '../domain/boarding'
import { CheckInError } from '../errors'
import { BOOKINGS, GATES, PROFILES, SEEDED_DOC_EXPIRY, SEEDED_PASSES } from '../providers/fixtures'
import { CLOCK } from '../providers/providers'
import type { ClockProvider } from '../providers/providers'

export interface CheckInRecord {
  id: string
  booking_passenger_id: string
  passenger_id: string
  flight_id: string
  status: CheckInStatus
  declared_bags: number | null
  screening_run_id: string | null
  checked_in_at: Date | null
  created_at: Date
  updated_at: Date
  started_by_user_id: string | null
  /** Denormalised for the staff search; feature 3 owns the real booking. */
  pnr: string
  passenger_name: string
}

export interface TravelDocumentRecord {
  id: string
  check_in_id: string
  doc_type: 'P'
  number_last4: string
  issuing_country: string
  nationality: string | null
  expiry_date: string
  visa_number: string | null
  visa_required: boolean
  /** In-memory only until the migration carries the visa review columns. */
  visa_checked_by: string | null
  visa_checked_at: Date | null
  name_mismatch: boolean
  name_mismatch_cleared_by: string | null
  name_mismatch_cleared_at: Date | null
  profile_differences: string[]
  created_at: Date
  updated_at: Date
}

export interface CheckedBagRecord {
  id: string
  check_in_id: string
  tag_number: string | null
  weight_kg: number
  excess_kg: number
  rate_per_kg: number
  excess_fee: number
  excess_payment_id: string | null
  status: 'weighed' | 'tagged' | 'offloaded'
  weighed_by: string | null
  weighed_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CarryOnCheckRecord {
  id: string
  check_in_id: string
  weight_kg: number
  within_size: boolean
  result: 'ok' | 'must_check'
  staff_id: string | null
  checked_at: Date
  created_at: Date
}

export interface FlightBoardingRecord {
  flight_id: string
  gate_id: string
  sensor_count: number | null
  manual_count: number | null
  boarded_count: number | null
  closed_at: Date | null
  closed_by: string | null
  created_at: Date
  updated_at: Date
}

export interface BoardingPassRecord {
  id: string
  check_in_id: string
  reference: string
  seat_code: string
  boarding_group: number
  printed_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface BoardingEventRecord {
  id: string
  flight_id: string
  gate_id: string
  boarding_pass_id: string | null
  scanned_reference: string | null
  event: 'boarded' | 'rejected' | 'no_show'
  reason: string | null
  staff_id: string | null
  occurred_at: Date
  created_at: Date
}

export interface GateRecord {
  id: string
  airport_code: string
  code: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export type CheckInPatch = Partial<
  Omit<CheckInRecord, 'id' | 'created_at' | 'updated_at' | 'booking_passenger_id' | 'passenger_id' | 'flight_id'>
>

/**
 * In-memory stand-in for the feature 6 tables. The records use the column names of the migration, so moving to
 * Prisma is a change of this file only.
 */
@Injectable()
export class CheckInStore {
  private readonly checkIns = new Map<string, CheckInRecord>()
  private readonly documents = new Map<string, TravelDocumentRecord>()
  private readonly bags = new Map<string, CheckedBagRecord>()
  private readonly carryOnChecks = new Map<string, CarryOnCheckRecord>()
  private readonly boardingRows = new Map<string, FlightBoardingRecord>()
  private readonly passes = new Map<string, BoardingPassRecord>()
  private readonly events = new Map<string, BoardingEventRecord>()
  private readonly gates = new Map<string, GateRecord>()
  private bagTagSeq = 0
  private seq = 0
  private clock: ClockProvider | null = null

  constructor(@Optional() @Inject(CLOCK) clock?: ClockProvider) {
    if (clock) this.seedDemo(clock)
  }

  seedDemo(clock: ClockProvider): void {
    this.clock = clock
    this.checkIns.clear()
    this.documents.clear()
    this.bags.clear()
    this.carryOnChecks.clear()
    this.boardingRows.clear()
    this.passes.clear()
    this.events.clear()
    this.gates.clear()
    this.bagTagSeq = 0
    this.seq = 0

    const now = clock.now()
    for (const gate of GATES) {
      this.gates.set(gate.id, { ...gate, created_at: now, updated_at: now })
    }
    this.upsertFlightBoarding('flt-fy204', 'gate-a1')
    this.upsertFlightBoarding('flt-fy318', 'gate-a2')

    for (const seed of SEEDED_PASSES) {
      const booking = BOOKINGS.find((b) => b.pnr === seed.pnr)
      if (!booking) continue
      const profile = PROFILES.find((p) => p.id === booking.passengerId)
      const checkIn = this.createCheckIn({
        booking_passenger_id: booking.bookingPassengerId,
        passenger_id: booking.passengerId,
        flight_id: booking.flightId,
        pnr: booking.pnr,
        passenger_name: `${booking.firstName} ${booking.lastName}`,
        status: seed.status,
        screening_run_id: seed.status === 'on_hold' ? 'scr-demo-hold' : null,
        checked_in_at: now,
      })
      this.createDocument({
        check_in_id: checkIn.id,
        number_last4: profile?.passportNumber?.slice(-4) ?? '0000',
        issuing_country: profile?.nationality ?? 'th',
        nationality: profile?.nationality ?? null,
        expiry_date: SEEDED_DOC_EXPIRY,
      })
      this.createPass({
        check_in_id: checkIn.id,
        reference: seed.reference,
        seat_code: seed.seat,
        boarding_group: boardingGroup({ specialAssistance: booking.specialAssistance, cabin: booking.cabin, tier: null }),
      })
    }
  }

  createCheckIn(input: {
    booking_passenger_id: string
    passenger_id: string
    flight_id: string
    pnr: string
    passenger_name: string
    status?: CheckInStatus
    declared_bags?: number | null
    screening_run_id?: string | null
    checked_in_at?: Date | null
    started_by_user_id?: string | null
  }): CheckInRecord {
    const now = this.now()
    const record: CheckInRecord = {
      id: `ci-${(this.seq += 1)}`,
      booking_passenger_id: input.booking_passenger_id,
      passenger_id: input.passenger_id,
      flight_id: input.flight_id,
      status: input.status ?? 'started',
      declared_bags: input.declared_bags ?? null,
      screening_run_id: input.screening_run_id ?? null,
      checked_in_at: input.checked_in_at ?? null,
      created_at: now,
      updated_at: now,
      started_by_user_id: input.started_by_user_id ?? null,
      pnr: input.pnr,
      passenger_name: input.passenger_name,
    }
    this.checkIns.set(record.id, record)
    return record
  }

  getCheckIn(id: string): CheckInRecord | null {
    return this.checkIns.get(id) ?? null
  }

  updateCheckIn(id: string, patch: CheckInPatch): CheckInRecord {
    const record = this.checkIns.get(id)
    if (!record) throw new CheckInError(404, 'NOT_FOUND', 'Check-in not found')
    Object.assign(record, patch)
    record.updated_at = this.now()
    return record
  }

  findActiveCheckInByBookingPassenger(bookingPassengerId: string): CheckInRecord | null {
    for (const record of this.checkIns.values()) {
      if (record.booking_passenger_id === bookingPassengerId && record.status !== 'cancelled') return record
    }
    return null
  }

  listCheckIns(): CheckInRecord[] {
    return [...this.checkIns.values()]
  }

  listCheckInsByFlight(flightId: string): CheckInRecord[] {
    return [...this.checkIns.values()].filter((c) => c.flight_id === flightId)
  }

  /** The check-in a customer started, used to show them their own seat on the map. */
  findActiveCheckInByUser(userId: string, flightId?: string): CheckInRecord | null {
    for (const record of this.checkIns.values()) {
      if (record.started_by_user_id !== userId) continue
      if (flightId && record.flight_id !== flightId) continue
      if (record.status === 'cancelled') continue
      return record
    }
    return null
  }

  searchCheckIns(query: { flightId?: string; pnr?: string; name?: string }): CheckInRecord[] {
    const pnr = query.pnr?.trim().toUpperCase()
    const name = query.name?.trim().toUpperCase()
    return [...this.checkIns.values()].filter((c) => {
      if (query.flightId && c.flight_id !== query.flightId) return false
      if (pnr && !c.pnr.toUpperCase().includes(pnr)) return false
      if (name && !c.passenger_name.toUpperCase().includes(name)) return false
      return true
    })
  }

  createDocument(input: {
    check_in_id: string
    number_last4: string
    issuing_country: string
    nationality?: string | null
    expiry_date: string
    visa_number?: string | null
    visa_required?: boolean
    name_mismatch?: boolean
    profile_differences?: string[]
  }): TravelDocumentRecord {
    const now = this.now()
    const record: TravelDocumentRecord = {
      id: `td-${(this.seq += 1)}`,
      check_in_id: input.check_in_id,
      doc_type: 'P',
      number_last4: input.number_last4,
      issuing_country: input.issuing_country,
      nationality: input.nationality ?? null,
      expiry_date: input.expiry_date,
      visa_number: input.visa_number ?? null,
      visa_required: input.visa_required ?? false,
      visa_checked_by: null,
      visa_checked_at: null,
      name_mismatch: input.name_mismatch ?? false,
      name_mismatch_cleared_by: null,
      name_mismatch_cleared_at: null,
      profile_differences: input.profile_differences ?? [],
      created_at: now,
      updated_at: now,
    }
    this.documents.set(record.id, record)
    return record
  }

  getDocument(id: string): TravelDocumentRecord | null {
    return this.documents.get(id) ?? null
  }

  getDocumentByCheckIn(checkInId: string): TravelDocumentRecord | null {
    for (const document of this.documents.values()) {
      if (document.check_in_id === checkInId) return document
    }
    return null
  }

  listDocuments(): TravelDocumentRecord[] {
    return [...this.documents.values()]
  }

  updateDocument(id: string, patch: Partial<Omit<TravelDocumentRecord, 'id' | 'check_in_id' | 'created_at'>>): TravelDocumentRecord {
    const record = this.documents.get(id)
    if (!record) throw new CheckInError(404, 'NOT_FOUND', 'Travel document not found')
    Object.assign(record, patch)
    record.updated_at = this.now()
    return record
  }

  createBag(input: {
    check_in_id: string
    weight_kg: number
    excess_kg: number
    rate_per_kg: number
    excess_fee: number
    weighed_by: string | null
    tag_number?: string | null
    excess_payment_id?: string | null
    status?: CheckedBagRecord['status']
  }): CheckedBagRecord {
    const now = this.now()
    const record: CheckedBagRecord = {
      id: `bag-${(this.seq += 1)}`,
      check_in_id: input.check_in_id,
      tag_number: input.tag_number ?? null,
      weight_kg: input.weight_kg,
      excess_kg: input.excess_kg,
      rate_per_kg: input.rate_per_kg,
      excess_fee: input.excess_fee,
      excess_payment_id: input.excess_payment_id ?? null,
      status: input.status ?? 'weighed',
      weighed_by: input.weighed_by,
      weighed_at: now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }
    this.bags.set(record.id, record)
    return record
  }

  getBag(id: string): CheckedBagRecord | null {
    return this.bags.get(id) ?? null
  }

  listBags(checkInId: string): CheckedBagRecord[] {
    return [...this.bags.values()].filter((b) => b.check_in_id === checkInId && b.deleted_at === null)
  }

  /** Feature 10 looks a bag up by the number on its tag. */
  findBagByTag(tagNumber: string): CheckedBagRecord | null {
    for (const bag of this.bags.values()) {
      if (bag.tag_number === tagNumber && bag.deleted_at === null) return bag
    }
    return null
  }

  updateBag(id: string, patch: Partial<Omit<CheckedBagRecord, 'id' | 'check_in_id' | 'created_at'>>): CheckedBagRecord {
    const record = this.bags.get(id)
    if (!record) throw new CheckInError(404, 'NOT_FOUND', 'Bag not found')
    Object.assign(record, patch)
    record.updated_at = this.now()
    return record
  }

  /** Soft delete: a tagged bag is never removed, the row stays for the audit. */
  deleteBag(id: string): CheckedBagRecord {
    const record = this.bags.get(id)
    if (!record) throw new CheckInError(404, 'NOT_FOUND', 'Bag not found')
    record.deleted_at = this.now()
    record.updated_at = record.deleted_at
    return record
  }

  nextBagTagSeq(): number {
    this.bagTagSeq += 1
    return this.bagTagSeq
  }

  upsertCarryOnCheck(input: {
    check_in_id: string
    weight_kg: number
    within_size: boolean
    result: 'ok' | 'must_check'
    staff_id: string | null
  }): CarryOnCheckRecord {
    const now = this.now()
    const existing = this.carryOnChecks.get(input.check_in_id)
    const record: CarryOnCheckRecord = {
      id: existing?.id ?? `co-${(this.seq += 1)}`,
      check_in_id: input.check_in_id,
      weight_kg: input.weight_kg,
      within_size: input.within_size,
      result: input.result,
      staff_id: input.staff_id,
      checked_at: now,
      created_at: existing?.created_at ?? now,
    }
    this.carryOnChecks.set(input.check_in_id, record)
    return record
  }

  getCarryOnCheck(checkInId: string): CarryOnCheckRecord | null {
    return this.carryOnChecks.get(checkInId) ?? null
  }

  listGates(): GateRecord[] {
    return [...this.gates.values()]
  }

  getGate(id: string): GateRecord | null {
    return this.gates.get(id) ?? null
  }

  flightBoarding(flightId: string): FlightBoardingRecord | null {
    return this.boardingRows.get(flightId) ?? null
  }

  upsertFlightBoarding(flightId: string, gateId: string): FlightBoardingRecord {
    const now = this.now()
    const existing = this.boardingRows.get(flightId)
    const record: FlightBoardingRecord = {
      flight_id: flightId,
      gate_id: gateId,
      sensor_count: existing?.sensor_count ?? null,
      manual_count: existing?.manual_count ?? null,
      boarded_count: existing?.boarded_count ?? null,
      closed_at: existing?.closed_at ?? null,
      closed_by: existing?.closed_by ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
    this.boardingRows.set(flightId, record)
    return record
  }

  updateFlightBoarding(flightId: string, patch: Partial<Omit<FlightBoardingRecord, 'flight_id' | 'created_at'>>): FlightBoardingRecord {
    const record = this.boardingRows.get(flightId)
    if (!record) throw new CheckInError(404, 'NOT_FOUND', 'Flight boarding not found')
    Object.assign(record, patch)
    record.updated_at = this.now()
    return record
  }

  createPass(input: { check_in_id: string; reference: string; seat_code: string; boarding_group: number }): BoardingPassRecord {
    const now = this.now()
    const record: BoardingPassRecord = {
      id: `pass-${(this.seq += 1)}`,
      check_in_id: input.check_in_id,
      reference: input.reference,
      seat_code: input.seat_code,
      boarding_group: input.boarding_group,
      printed_at: null,
      created_at: now,
      updated_at: now,
    }
    this.passes.set(record.id, record)
    return record
  }

  getPass(id: string): BoardingPassRecord | null {
    return this.passes.get(id) ?? null
  }

  passByReference(reference: string): BoardingPassRecord | null {
    for (const pass of this.passes.values()) {
      if (pass.reference === reference) return pass
    }
    return null
  }

  passesForCheckIn(checkInId: string): BoardingPassRecord[] {
    return [...this.passes.values()].filter((p) => p.check_in_id === checkInId)
  }

  listPasses(): BoardingPassRecord[] {
    return [...this.passes.values()]
  }

  updatePass(id: string, patch: Partial<Omit<BoardingPassRecord, 'id' | 'check_in_id' | 'created_at'>>): BoardingPassRecord {
    const record = this.passes.get(id)
    if (!record) throw new CheckInError(404, 'NOT_FOUND', 'Boarding pass not found')
    Object.assign(record, patch)
    record.updated_at = this.now()
    return record
  }

  /** The unique index on the final events: a pass boards or no-shows exactly once. */
  appendEvent(input: {
    flight_id: string
    gate_id: string
    boarding_pass_id: string | null
    scanned_reference: string | null
    event: 'boarded' | 'rejected' | 'no_show'
    reason: string | null
    staff_id: string | null
    occurred_at?: Date
  }): BoardingEventRecord {
    if (input.boarding_pass_id && (input.event === 'boarded' || input.event === 'no_show') && this.hasFinalEvent(input.boarding_pass_id)) {
      throw new CheckInError(409, 'INVALID_STATE', 'pass already final')
    }
    const now = this.now()
    const record: BoardingEventRecord = {
      id: `ev-${(this.seq += 1)}`,
      flight_id: input.flight_id,
      gate_id: input.gate_id,
      boarding_pass_id: input.boarding_pass_id,
      scanned_reference: input.scanned_reference,
      event: input.event,
      reason: input.reason,
      staff_id: input.staff_id,
      occurred_at: input.occurred_at ?? now,
      created_at: now,
    }
    this.events.set(record.id, record)
    return record
  }

  listEvents(flightId: string): BoardingEventRecord[] {
    return [...this.events.values()].filter((e) => e.flight_id === flightId)
  }

  hasFinalEvent(boardingPassId: string): boolean {
    for (const event of this.events.values()) {
      if (event.boarding_pass_id === boardingPassId && (event.event === 'boarded' || event.event === 'no_show')) return true
    }
    return false
  }

  private now(): Date {
    if (!this.clock) throw new Error('CheckInStore has no clock: inject CLOCK or call seedDemo(clock) first')
    return this.clock.now()
  }
}
