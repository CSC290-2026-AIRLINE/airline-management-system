/* eslint-disable @typescript-eslint/require-await -- the provider interfaces are async so the real modules can be swapped in */
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Cabin, CarryOnAllowance, SeatLock, SeatMap, SeatStatus, SeatType } from '../api-types'
import { CheckInError } from '../errors'
import {
  BLOCKED_SEATS,
  BOOKINGS,
  DEMO_NOW,
  FARE_CLASS_CABIN,
  FLIGHTS,
  HOLD_LAST4,
  PROFILES,
  PRICING,
  SEAT_LAYOUT,
  SEAT_LIST,
  SEEDED_PASSES,
  SETTINGS,
  TAKEN_SEATS,
  VISA_RULES,
  seatOf,
} from './fixtures'
import type {
  AuditProvider,
  BookingPassenger,
  BookingProvider,
  ClockProvider,
  FlightProvider,
  FlightRecord,
  NotifyProvider,
  PassengerProfile,
  PassengerProfileProvider,
  PaymentProvider,
  PoliceProvider,
  PricingProvider,
  ScreeningProvider,
  SeatProvider,
  SensorProvider,
  SettingsProvider,
  StaffIdentityProvider,
  TierProvider,
} from './providers'
import { CLOCK } from './providers'

@Injectable()
export class FixtureClock implements ClockProvider {
  private current = new Date(DEMO_NOW)

  now(): Date {
    return new Date(this.current)
  }

  set(d: Date): void {
    this.current = new Date(d)
  }
}

@Injectable()
export class FixtureFlights implements FlightProvider {
  async byId(id: string): Promise<FlightRecord | null> {
    return FLIGHTS.find((f) => f.id === id) ?? null
  }

  async list(): Promise<FlightRecord[]> {
    return FLIGHTS
  }
}

@Injectable()
export class FixtureBookings implements BookingProvider {
  async findByPnrAndLastName(pnr: string, lastName: string): Promise<BookingPassenger[]> {
    const wantedPnr = pnr.trim().toUpperCase()
    const wantedName = lastName.trim().toUpperCase()
    return BOOKINGS.filter((b) => b.pnr.toUpperCase() === wantedPnr && b.lastName.toUpperCase() === wantedName)
  }

  async byBookingPassengerId(id: string): Promise<BookingPassenger | null> {
    return BOOKINGS.find((b) => b.bookingPassengerId === id) ?? null
  }

  async listByFlight(flightId: string): Promise<BookingPassenger[]> {
    return BOOKINGS.filter((b) => b.flightId === flightId)
  }
}

@Injectable()
export class FixturePassengers implements PassengerProfileProvider {
  private readonly profiles = new Map(PROFILES.map((p) => [p.id, { ...p }]))

  async byId(id: string): Promise<PassengerProfile | null> {
    return this.profiles.get(id) ?? null
  }

  async findByPassportNumber(n: string): Promise<PassengerProfile[]> {
    return [...this.profiles.values()].filter((p) => p.passportNumber === n)
  }

  /** Fills empty fields only: feature 7's set-once rule, a difference is flagged for staff. */
  async fill(id: string, fields: Partial<Omit<PassengerProfile, 'id' | 'firstName' | 'lastName'>>): Promise<void> {
    const profile = this.profiles.get(id)
    if (!profile) return
    if (profile.dateOfBirth === null && fields.dateOfBirth !== undefined) profile.dateOfBirth = fields.dateOfBirth
    if (profile.gender === null && fields.gender !== undefined) profile.gender = fields.gender
    if (profile.nationality === null && fields.nationality !== undefined) profile.nationality = fields.nationality
    if (profile.passportNumber === null && fields.passportNumber !== undefined) profile.passportNumber = fields.passportNumber
  }
}

interface FixtureLock {
  lock: SeatLock
  bookingPassengerId: string
}

@Injectable()
export class FixtureSeats implements SeatProvider {
  private readonly locks = new Map<string, FixtureLock>()
  private readonly assignments = new Map<string, { seatCode: string; type: SeatType }>()
  private lockSeq = 0

  constructor(@Inject(CLOCK) private readonly clock: ClockProvider) {
    for (const seed of SEEDED_PASSES) {
      this.assignments.set(`bp-${seed.pnr.toLowerCase()}`, { seatCode: seed.seat, type: seatOf(seed.seat)?.type ?? 'standard' })
    }
  }

  async seatMap(flightId: string, viewer: { bookingPassengerId: string | null; cabin: Cabin | null }): Promise<SeatMap> {
    const mine = viewer.bookingPassengerId ? this.assignments.get(viewer.bookingPassengerId)?.seatCode : undefined
    const takenOnFlight = this.seatsTakenOnFlight(flightId)
    const rows: SeatMap['rows'] = []

    for (const seat of SEAT_LIST) {
      let row = rows.find((r) => r.row === seat.row)
      if (!row) {
        row = { row: seat.row, exitRow: SEAT_LAYOUT.exitRows.includes(seat.row), seats: [] }
        rows.push(row)
      }
      row.seats.push({
        code: seat.code,
        row: seat.row,
        letter: seat.letter,
        cabin: seat.cabin,
        type: seat.type,
        status: this.statusOf(seat.code, viewer, mine, takenOnFlight),
        fee: seat.fee,
      })
    }
    return { flightId, rows }
  }

  async hold(flightId: string, seatCode: string, bookingPassengerId: string, ttlMs: number): Promise<SeatLock> {
    const seat = seatOf(seatCode)
    if (!seat) throw new CheckInError(400, 'VALIDATION', `Seat ${seatCode} does not exist`)
    const booking = BOOKINGS.find((b) => b.bookingPassengerId === bookingPassengerId)
    if (booking && seat.cabin !== booking.cabin) {
      throw new CheckInError(409, 'SEAT_TAKEN', `Seat ${seatCode} is not in your cabin`, { seatCode })
    }
    if (BLOCKED_SEATS.has(seatCode) || TAKEN_SEATS.has(seatCode)) {
      throw new CheckInError(409, 'SEAT_TAKEN', `Seat ${seatCode} is not available`, { seatCode })
    }
    const own = this.assignments.get(bookingPassengerId)?.seatCode === seatCode
    if (!own && this.seatsTakenOnFlight(flightId).has(seatCode)) {
      throw new CheckInError(409, 'SEAT_TAKEN', `Seat ${seatCode} is taken`, { seatCode })
    }
    if (this.heldByOther(seatCode, bookingPassengerId)) {
      throw new CheckInError(409, 'SEAT_TAKEN', `Seat ${seatCode} is held by another passenger`, { seatCode })
    }

    for (const [id, entry] of this.locks) {
      if (entry.bookingPassengerId === bookingPassengerId) this.locks.delete(id)
    }
    this.lockSeq += 1
    const lock: SeatLock = {
      id: `lock-${this.lockSeq}`,
      flightId,
      seatCode,
      expiresAt: new Date(this.clock.now().getTime() + ttlMs).toISOString(),
      fee: seat.fee,
    }
    this.locks.set(lock.id, { lock, bookingPassengerId })
    return lock
  }

  async release(lockId: string): Promise<void> {
    this.locks.delete(lockId)
  }

  async confirm(lockId: string): Promise<{ seatCode: string; type: SeatType }> {
    const entry = this.locks.get(lockId)
    if (!entry) throw new CheckInError(404, 'NOT_FOUND', `Seat hold ${lockId} not found`)
    if (new Date(entry.lock.expiresAt).getTime() <= this.clock.now().getTime()) {
      this.locks.delete(lockId)
      throw new CheckInError(409, 'LOCK_EXPIRED', 'The seat hold has expired', { seatCode: entry.lock.seatCode })
    }
    this.locks.delete(lockId)
    const type = seatOf(entry.lock.seatCode)?.type ?? 'standard'
    this.assignments.set(entry.bookingPassengerId, { seatCode: entry.lock.seatCode, type })
    return { seatCode: entry.lock.seatCode, type }
  }

  async assigned(bookingPassengerId: string): Promise<{ seatCode: string; type: SeatType } | null> {
    return this.assignments.get(bookingPassengerId) ?? null
  }

  async assignAnyStandard(
    flightId: string,
    bookingPassengerId: string,
    opts: { avoidExitRow: boolean },
  ): Promise<{ seatCode: string; type: SeatType }> {
    const booking = BOOKINGS.find((b) => b.bookingPassengerId === bookingPassengerId)
    const cabin = booking?.cabin ?? 'economy'
    const takenOnFlight = this.seatsTakenOnFlight(flightId)
    const free = SEAT_LIST.filter(
      (seat) =>
        seat.cabin === cabin &&
        !TAKEN_SEATS.has(seat.code) &&
        !BLOCKED_SEATS.has(seat.code) &&
        !takenOnFlight.has(seat.code) &&
        !this.heldByOther(seat.code, bookingPassengerId),
    )
    // Unpaid seats first; an exit row only when the passenger may have one and nothing else is left.
    const seat =
      free.find((s) => s.type === 'standard' || s.type === 'business') ??
      (opts.avoidExitRow ? undefined : free.find((s) => s.type === 'exit'))
    if (!seat) throw new CheckInError(409, 'SEAT_TAKEN', 'No free seat left on this flight')
    this.assignments.set(bookingPassengerId, { seatCode: seat.code, type: seat.type })
    return { seatCode: seat.code, type: seat.type }
  }

  async releaseAssigned(bookingPassengerId: string): Promise<void> {
    this.assignments.delete(bookingPassengerId)
  }

  private statusOf(
    seatCode: string,
    viewer: { bookingPassengerId: string | null; cabin: Cabin | null },
    mine: string | undefined,
    takenOnFlight: Set<string>,
  ): SeatStatus {
    if (mine === seatCode) return 'mine'
    if (TAKEN_SEATS.has(seatCode)) return 'taken'
    if (BLOCKED_SEATS.has(seatCode)) return 'blocked'
    if (viewer.cabin && seatOf(seatCode)?.cabin !== viewer.cabin) return 'blocked'
    if (takenOnFlight.has(seatCode)) return 'taken'
    if (this.heldByOther(seatCode, viewer.bookingPassengerId)) return 'held'
    return 'free'
  }

  private seatsTakenOnFlight(flightId: string): Set<string> {
    const taken = new Set<string>()
    for (const booking of BOOKINGS.filter((b) => b.flightId === flightId)) {
      const seatCode = this.assignments.get(booking.bookingPassengerId)?.seatCode
      if (seatCode) taken.add(seatCode)
    }
    return taken
  }

  private heldByOther(seatCode: string, bookingPassengerId: string | null): boolean {
    const now = this.clock.now().getTime()
    for (const entry of this.locks.values()) {
      if (entry.lock.seatCode === seatCode && entry.bookingPassengerId !== bookingPassengerId) {
        if (new Date(entry.lock.expiresAt).getTime() > now) return true
      }
    }
    return false
  }
}

@Injectable()
export class FixturePricing implements PricingProvider {
  /** Feature 4's per route override is not in the demo data, the fare class decides. */
  async baggage(fareClass: string): Promise<{ freeKg: number; ratePerKg: number; maxBagKg: number }> {
    return PRICING.baggage[FARE_CLASS_CABIN[fareClass] ?? 'economy']
  }

  async seatFee(cabin: Cabin, type: SeatType): Promise<number> {
    return PRICING.seatFee[type]
  }
}

@Injectable()
export class FixturePayments implements PaymentProvider {
  readonly charges: Array<{ amount: number; currency: 'THB'; purpose: string; reference: string }> = []
  private seq = 0

  async charge(input: {
    amount: number
    currency: 'THB'
    purpose: 'seat' | 'excess_baggage'
    reference: string
  }): Promise<{ paymentId: string }> {
    this.seq += 1
    this.charges.push(input)
    return { paymentId: `pay-${this.seq}` }
  }
}

@Injectable()
export class FixtureScreening implements ScreeningProvider {
  private seq = 0

  /** Held when the passport last four match the demo value or the passenger is flagged by name. */
  async check(input: {
    passengerId: string
    flightId: string
    numberLast4: string
    lastName: string
  }): Promise<{ runId: string; outcome: 'clear' | 'held' }> {
    this.seq += 1
    const held = input.numberLast4 === HOLD_LAST4 || input.lastName.toUpperCase() === 'KOWALSKI'
    return { runId: `scr-${this.seq}`, outcome: held ? 'held' : 'clear' }
  }
}

@Injectable()
export class FixturePolice implements PoliceProvider {
  async policePassengerIds(flightId: string): Promise<string[]> {
    return BOOKINGS.filter((b) => b.flightId === flightId && b.isPolice).map((b) => b.passengerId)
  }
}

@Injectable()
export class FixtureTiers implements TierProvider {
  private readonly tiers = new Map<string, { level: 'top' | 'other'; bagBonusKg: number }>()

  async tier(passengerId: string): Promise<{ level: 'top' | 'other'; bagBonusKg: number } | null> {
    return this.tiers.get(passengerId) ?? null
  }
}

@Injectable()
export class LoggerNotify implements NotifyProvider {
  private readonly logger = new Logger(LoggerNotify.name)

  async send(event: 'check_in_done' | 'boarding_pass' | 'gate_change' | 'boarding_call', payload: Record<string, unknown>): Promise<void> {
    this.logger.log(`notify ${event} ${JSON.stringify(payload)}`)
  }
}

@Injectable()
export class LoggerAudit implements AuditProvider {
  private readonly logger = new Logger(LoggerAudit.name)

  async record(entry: {
    actorType: 'staff' | 'customer' | 'system'
    actorId: string | null
    action: string
    entityType: string
    entityId: string
    summary: string
    isSensitive?: boolean
    before?: unknown
    after?: unknown
  }): Promise<void> {
    const line = `audit ${entry.action} ${entry.entityType} ${entry.entityId} ${entry.summary}`
    // A sensitive record never writes its payload, a passport or an MRZ line must not reach the log.
    this.logger.log(entry.isSensitive ? line : `${line} ${JSON.stringify({ before: entry.before, after: entry.after })}`)
  }
}

@Injectable()
export class FixtureSensor implements SensorProvider {
  private readonly overrides = new Map<string, number | null>()

  async read(gateId: string, hint: { boardedCount: number }): Promise<number | null> {
    return this.overrides.get(gateId) ?? hint.boardedCount
  }

  setOverride(gateId: string, count: number | null): void {
    this.overrides.set(gateId, count)
  }
}

@Injectable()
export class FixtureStaffIdentity implements StaffIdentityProvider {
  private readonly logger = new Logger(FixtureStaffIdentity.name)
  readonly seen = new Set<string>()

  constructor() {
    this.logger.warn('Staff identity is a placeholder: every signed-in user counts as staff until the platform ships roles')
  }

  async resolve(user: { id: string; email: string }): Promise<{ isStaff: boolean; staffId: string | null }> {
    this.seen.add(user.id)
    return { isStaff: true, staffId: 'staff-demo' }
  }
}

@Injectable()
export class FixtureSettings implements SettingsProvider {
  private readonly carryOnAllowances = new Map<Cabin, CarryOnAllowance>(
    (['economy', 'premium_economy', 'business', 'first'] as Cabin[]).map((cabin) => [cabin, { ...SETTINGS.carryOn }]),
  )

  async window() {
    return SETTINGS.window
  }

  async checkedBagMaxLinearCm(): Promise<number> {
    return SETTINGS.checkedBagMaxLinearCm
  }

  async bagTagAirlineNumber(): Promise<string> {
    return SETTINGS.bagTagAirlineNumber
  }

  async carryOn(cabin: Cabin): Promise<CarryOnAllowance> {
    return this.carryOnAllowances.get(cabin) ?? { ...SETTINGS.carryOn }
  }

  async visaRequired(nationality2: string, destinationCountry2: string): Promise<boolean> {
    const rule = VISA_RULES.find(([n, d]) => n === nationality2 && d === destinationCountry2)
    return rule ? rule[2] : false
  }
}
