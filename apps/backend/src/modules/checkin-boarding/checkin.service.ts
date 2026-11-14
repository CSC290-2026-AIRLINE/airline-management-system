import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type {
  BagAllowance,
  BoardingPassView,
  Cabin,
  CheckInStatus,
  CheckInView,
  SeatChoice,
  SeatLock,
  SeatMap,
  SeatMapSeat,
  SeatType,
} from './api-types'
import type { Actor } from './actor'
import { canCustomerAccess } from './actor'
import { bagAllowance } from './domain/allowance'
import { boardingGroup } from './domain/boarding'
import { toAlpha2 } from './domain/countries'
import type { MrzData } from './domain/mrz'
import { compareNames, isPassportValidForTravel, profileSync, stripNonLetters, validateMrz } from './domain/mrz'
import { computeWindow, isWindowOpen } from './domain/window'
import type { Window } from './domain/window'
import { CheckInError, invalidState, notFound, validation } from './errors'
import { toBoardingPassView, toCheckInView, toCheckInWindow, toDocumentView, toFlightSummary } from './mappers'
import {
  AUDIT,
  BOOKINGS,
  CLOCK,
  FLIGHTS,
  NOTIFY,
  PASSENGERS,
  PAYMENTS,
  POLICE,
  PRICING,
  SCREENING,
  SEATS,
  SETTINGS,
  TIERS,
} from './providers/providers'
import type {
  AuditProvider,
  BookingPassenger,
  BookingProvider,
  ClockProvider,
  CustomerRef,
  FlightProvider,
  FlightRecord,
  NotifyProvider,
  PassengerProfileProvider,
  PaymentProvider,
  PoliceProvider,
  PricingProvider,
  ScreeningProvider,
  SeatProvider,
  SettingsProvider,
  TierProvider,
} from './providers/providers'
import { newReference } from './reference'
import type { BoardingPassRecord, CheckInPatch, CheckInRecord, TravelDocumentRecord } from './store/checkin-store'
import { CHECKIN_REPOSITORY } from './store/checkin-repository'
import type { CheckInRepository } from './store/checkin-repository'

/** Feature 3 holds a seat for five minutes. */
const SEAT_HOLD_TTL_MS = 300_000

interface HeldSeat {
  lock: SeatLock
  checkInId: string
}

/**
 * The passenger side of feature 6: find the booking, submit the passport, pick a seat, declare the bags and
 * collect the boarding pass. Every other feature sits behind a provider, the rules live in domain/.
 */
@Injectable()
export class CheckInService {
  /** The holds this service handed out, so the fee is known when the seat is confirmed. */
  private readonly holds = new Map<string, HeldSeat>()
  /** Feature 5's payment id per booking passenger; the seat itself lives in feature 3. */
  private readonly seatPayments = new Map<string, string | null>()

  constructor(
    @Inject(CLOCK) private readonly clock: ClockProvider,
    @Inject(FLIGHTS) private readonly flights: FlightProvider,
    @Inject(BOOKINGS) private readonly bookings: BookingProvider,
    @Inject(PASSENGERS) private readonly passengers: PassengerProfileProvider,
    @Inject(SEATS) private readonly seats: SeatProvider,
    @Inject(PRICING) private readonly pricing: PricingProvider,
    @Inject(PAYMENTS) private readonly payments: PaymentProvider,
    @Inject(SCREENING) private readonly screening: ScreeningProvider,
    @Inject(POLICE) private readonly police: PoliceProvider,
    @Inject(TIERS) private readonly tiers: TierProvider,
    @Inject(NOTIFY) private readonly notify: NotifyProvider,
    @Inject(AUDIT) private readonly audit: AuditProvider,
    @Inject(SETTINGS) private readonly settings: SettingsProvider,
    @Inject(CHECKIN_REPOSITORY) private readonly store: CheckInRepository,
  ) {}

  async start(actor: Actor, input: { pnr: string; lastName: string }): Promise<CheckInView> {
    const booking = (await this.bookings.findByPnrAndLastName(input.pnr, input.lastName))[0]
    if (!booking) throw notFound('Booking')
    if (!booking.paid) throw new CheckInError(409, 'NOT_ELIGIBLE', 'The booking is not paid', { reason: 'unpaid' })

    const flight = await this.flightOf(booking.flightId)
    if (flight.status === 'cancelled') {
      throw new CheckInError(409, 'NOT_ELIGIBLE', 'The flight is cancelled', { reason: 'flight_cancelled' })
    }
    this.assertWindowOpen(flight, await this.windowOf(flight))

    const existing = await this.store.findActiveCheckInByBookingPassenger(booking.bookingPassengerId)
    if (existing) {
      // The PNR and the surname proved the booking: the caller resumes the check-in of that booking.
      await this.record(actor, 'check_in.start', 'check_in', existing.id, 'resumed')
      if (await this.store.getDocumentByCheckIn(existing.id)) {
        await this.record(actor, 'view_sensitive', 'check_in', existing.id, 'check-in read', true)
      }
      return this.viewOf(existing)
    }

    const record = await this.store.createCheckIn({
      booking_passenger_id: booking.bookingPassengerId,
      passenger_id: booking.passengerId,
      flight_id: booking.flightId,
      status: 'started',
    })
    await this.record(actor, 'check_in.start', 'check_in', record.id, 'check-in started')
    return this.viewOf(record)
  }

  async get(actor: Actor, id: string): Promise<CheckInView> {
    const record = await this.require(actor, id)
    if (await this.store.getDocumentByCheckIn(record.id)) {
      await this.record(actor, 'view_sensitive', 'check_in', record.id, 'check-in read', true)
    }
    return this.viewOf(record)
  }

  async submitDocument(actor: Actor, id: string, input: { mrzLine1: string; mrzLine2: string; visaNumber?: string }): Promise<CheckInView> {
    const record = await this.require(actor, id)
    this.assertStarted(record, 'The travel document can only be submitted while the check-in is open')
    const flight = await this.flightOf(record.flight_id)
    this.assertWindowOpen(flight, await this.windowOf(flight))

    const mrz = validateMrz(input.mrzLine1, input.mrzLine2, { todayYear: this.clock.now().getFullYear() % 100 })
    if (!mrz.ok) throw new CheckInError(422, 'MRZ_INVALID', mrz.message, { failedCheck: mrz.failedCheck })
    const data = mrz.data
    if (!isPassportValidForTravel(data.expiryDate, flight.serviceDate)) {
      throw new CheckInError(422, 'PASSPORT_EXPIRING', 'The passport expires too soon for this trip', { expiryDate: data.expiryDate })
    }

    const booking = await this.bookingOf(record)
    const issuing2 = toAlpha2(data.issuingCountry3)
    if (!issuing2) {
      throw new CheckInError(422, 'MRZ_INVALID', 'The issuing country of this passport is not a known country', {
        failedCheck: 'issuing_country',
      })
    }
    const nationality2 = toAlpha2(data.nationality3)
    await this.assertNotDuplicate(record, booking, data, nationality2)

    const visaRequired = await this.settings.visaRequired(nationality2 ?? '', flight.destination.country)
    if (visaRequired && !input.visaNumber) {
      throw new CheckInError(422, 'VISA_REQUIRED', 'A visa number is required for this trip', { destination: flight.destination.code })
    }

    const profile = await this.passengers.byId(record.passenger_id)
    const sync = profileSync(profile ?? { dateOfBirth: null, gender: null, nationality: null, passportNumber: null }, data)
    if (Object.keys(sync.fill).length > 0) await this.passengers.fill(record.passenger_id, sync.fill)

    const document = await this.upsertDocument(record.id, {
      number_last4: data.numberLast4,
      issuing_country: issuing2,
      nationality: nationality2,
      expiry_date: data.expiryDate,
      // The visa number is only kept when the destination needs one.
      visa_number: visaRequired ? (input.visaNumber ?? null) : null,
      name_mismatch: compareNames(data, booking),
      profile_differences: [...sync.differences],
    })

    const screening = await this.screening.check({
      passengerId: record.passenger_id,
      flightId: flight.id,
      numberLast4: data.numberLast4,
      lastName: booking.lastName,
    })
    const updated = await this.store.updateCheckIn(record.id, {
      status: screening.outcome === 'held' ? 'on_hold' : record.status,
      screening_run_id: screening.runId,
    })
    await this.record(actor, 'travel_document.submit', 'travel_document', document.id, 'travel document submitted')
    return this.viewOf(updated)
  }

  /**
   * The seat map of a flight. The caller passes the check-in it is picking a seat for: the map then shows that
   * passenger their own seat and hides the other cabins. Without it the map has no viewer.
   */
  async seatMap(viewer: Actor | null, flightId: string, checkInId?: string): Promise<SeatMap> {
    let bookingPassengerId: string | null = null
    let cabin: Cabin | null = null
    if (viewer && viewer.staffId === null && checkInId) {
      const record = await this.store.getCheckIn(checkInId)
      if (record && record.flight_id === flightId) {
        bookingPassengerId = record.booking_passenger_id
        cabin = (await this.bookings.byBookingPassengerId(bookingPassengerId))?.cabin ?? null
      }
    }
    return this.seats.seatMap(flightId, { bookingPassengerId, cabin })
  }

  async holdSeat(actor: Actor, flightId: string, input: { checkInId: string; seatCode: string }): Promise<SeatLock> {
    const record = await this.require(actor, input.checkInId)
    if (record.flight_id !== flightId) throw notFound('Flight')
    this.assertOpen(record, 'A seat can only be picked while the check-in is open')
    const flight = await this.flightOf(record.flight_id)
    this.assertWindowOpen(flight, await this.windowOf(flight))
    if (!(await this.store.getDocumentByCheckIn(record.id))) {
      throw invalidState('The travel document must be submitted before a seat can be picked')
    }
    const booking = await this.bookingOf(record)
    const seat = await this.seatOf(flightId, input.seatCode)
    if (seat.type === 'exit' && booking.specialAssistance.length > 0) {
      throw validation('Exit row seats are not available to passengers who need special assistance', {
        reason: 'exit_row_special_assistance',
      })
    }
    const fee = await this.pricing.seatFee(booking.cabin, seat.type)
    const lock = await this.seats.hold(flightId, input.seatCode, record.booking_passenger_id, SEAT_HOLD_TTL_MS)
    const held: SeatLock = { ...lock, fee }
    this.holds.set(held.id, { lock: held, checkInId: record.id })
    return held
  }

  /** Gives the seat hold back. The lock id is the secret: whoever holds it may release it. */
  async releaseSeat(lockId: string): Promise<void> {
    this.holds.delete(lockId)
    await this.seats.release(lockId)
  }

  async confirmSeat(actor: Actor, id: string, input: { lockId: string }): Promise<CheckInView> {
    const record = await this.require(actor, id)
    this.assertOpen(record, 'The seat can only be confirmed while the check-in is open')
    const flight = await this.flightOf(record.flight_id)
    this.assertWindowOpen(flight, await this.windowOf(flight))
    const held = this.holds.get(input.lockId)
    if (!held || held.checkInId !== record.id) throw notFound('Seat hold')
    // The hold runs out before the money goes in: an expired hold is never charged.
    if (new Date(held.lock.expiresAt).getTime() <= this.clock.now().getTime()) {
      throw new CheckInError(409, 'LOCK_EXPIRED', 'The seat hold has expired', { seatCode: held.lock.seatCode })
    }
    const booking = await this.bookingOf(record)
    let paymentId: string | null = null
    if (held.lock.fee > 0) {
      const charge = await this.payments.charge({
        amount: held.lock.fee,
        currency: 'THB',
        purpose: 'seat',
        reference: `seat_assignment:${input.lockId}`,
        bookingId: booking.bookingId,
      })
      paymentId = charge.paymentId
    }
    let confirmed: { seatCode: string; type: SeatType }
    try {
      confirmed = await this.seats.confirm(input.lockId, paymentId)
    } catch (error) {
      // The money went in but the seat did not: the payment is left behind on purpose, the audit says so.
      if (paymentId) {
        await this.record(actor, 'seat.payment_orphaned', 'payment', paymentId, `seat ${input.lockId} was paid but not confirmed`)
      }
      throw error
    }
    this.holds.delete(input.lockId)
    this.seatPayments.set(record.booking_passenger_id, paymentId)
    const pass = (await this.store.passesForCheckIn(record.id))[0]
    if (pass) await this.store.updatePass(pass.id, { seat_code: confirmed.seatCode })
    await this.record(actor, 'check_in.seat_confirm', 'check_in', record.id, `seat ${confirmed.seatCode} confirmed`)
    return this.viewOf(record)
  }

  async declareBags(actor: Actor, id: string, input: { declaredBags: number }): Promise<CheckInView> {
    // The route table gives the bag count to the passenger, the counter weighs the bags.
    if (actor.staffId !== null) throw new CheckInError(403, 'FORBIDDEN', 'The bag count is declared by the passenger')
    const record = await this.require(actor, id)
    this.assertStarted(record, 'The bags can only be declared while the check-in is open')
    const flight = await this.flightOf(record.flight_id)
    this.assertWindowOpen(flight, await this.windowOf(flight))
    if (!Number.isInteger(input.declaredBags) || input.declaredBags < 0 || input.declaredBags > 10) {
      throw validation('The number of bags must be a whole number between 0 and 10', { declaredBags: input.declaredBags })
    }
    const updated = await this.store.updateCheckIn(record.id, { declared_bags: input.declaredBags })
    return this.viewOf(updated)
  }

  async complete(actor: Actor, id: string): Promise<BoardingPassView> {
    const record = await this.require(actor, id)
    const issued = (await this.store.passesForCheckIn(record.id))[0]
    if (issued) return this.passView(record, issued)
    this.assertStarted(record, 'The boarding pass can only be issued while the check-in is open')
    if (!(await this.store.getDocumentByCheckIn(record.id))) {
      throw invalidState('The travel document must be submitted before the boarding pass is issued')
    }
    const flight = await this.flightOf(record.flight_id)
    this.assertWindowOpen(flight, await this.windowOf(flight))

    const booking = await this.bookingOf(record)
    const seat =
      (await this.seats.assigned(record.booking_passenger_id)) ??
      (await this.seats.assignAnyStandard(flight.id, record.booking_passenger_id, {
        avoidExitRow: booking.specialAssistance.length > 0,
      }))
    const tier = await this.tiers.tier(record.passenger_id)
    const police = booking.isPolice || (await this.police.policePassengerIds(flight.id)).includes(record.passenger_id)
    const group = police
      ? 1
      : boardingGroup({ specialAssistance: booking.specialAssistance, cabin: booking.cabin, tier: tier?.level ?? null })

    await this.store.createPass({
      check_in_id: record.id,
      reference: newReference(),
      seat_code: seat.seatCode,
      boarding_group: group,
    })
    // A concurrent complete may have issued the pass first: read it back so both callers see the same one.
    const pass = (await this.store.passesForCheckIn(record.id))[0]
    const updated = await this.store.updateCheckIn(record.id, { status: 'checked_in', checked_in_at: this.clock.now() })
    await this.notify.send('boarding_pass_issued', { checkInId: record.id, reference: pass.reference, flightNumber: flight.flightNumber })
    await this.notify.send('check_in_completed', { checkInId: record.id, reference: pass.reference, flightNumber: flight.flightNumber })
    await this.record(actor, 'check_in.complete', 'boarding_pass', pass.id, 'boarding pass issued')
    return this.passView(updated, pass)
  }

  async boardingPass(actor: Actor, id: string): Promise<BoardingPassView> {
    const record = await this.require(actor, id)
    const pass = (await this.store.passesForCheckIn(record.id))[0]
    if (!pass) throw notFound('Boarding pass')
    return this.passView(record, pass)
  }

  /** Feature 7's callback: a hold may arrive after the pass was issued. */
  async applyScreeningResult(id: string, outcome: 'held' | 'clear' | 'denied'): Promise<void> {
    const record = await this.store.getCheckIn(id)
    if (!record) throw notFound('Check-in')
    if (record.status === 'boarded' || record.status === 'no_show' || record.status === 'cancelled') return
    const status: CheckInStatus =
      outcome === 'held'
        ? 'on_hold'
        : outcome === 'denied'
          ? 'denied'
          : (await this.store.passesForCheckIn(id)).length > 0
            ? 'checked_in'
            : 'started'
    const patch: CheckInPatch = { status }
    // The column is uuid and the CHECK needs a run id for on_hold/denied, so a hold without an F7 run gets a fresh one.
    if ((status === 'on_hold' || status === 'denied') && !record.screening_run_id) patch.screening_run_id = randomUUID()
    await this.store.updateCheckIn(id, patch)
  }

  /** A hold that is still open when the window closes becomes a no-show and gives the seat back. */
  async releaseExpiredHolds(): Promise<number> {
    let released = 0
    for (const record of await this.store.listCheckIns()) {
      if (record.status !== 'on_hold') continue
      const flight = await this.flightOf(record.flight_id)
      if (isWindowOpen(this.clock.now(), await this.windowOf(flight))) continue
      await this.seats.releaseAssigned(record.booking_passenger_id)
      await this.store.updateCheckIn(record.id, { status: 'no_show' })
      released += 1
    }
    return released
  }

  private async require(actor: Actor, id: string): Promise<CheckInRecord> {
    const record = await this.store.getCheckIn(id)
    if (!record) throw notFound('Check-in')
    if (!(await this.mayAccess(actor, record))) {
      throw new CheckInError(403, 'FORBIDDEN', 'This check-in belongs to another passenger')
    }
    return record
  }

  /**
   * The customer owns the check-in through the booking or through the passenger of their customer row. Until the
   * database carries the owner, the check-in id is the third way in.
   */
  private async mayAccess(actor: Actor, record: CheckInRecord): Promise<boolean> {
    const booking = await this.bookings.byBookingPassengerId(record.booking_passenger_id)
    const customer = await this.customerOf(actor)
    return canCustomerAccess(record, actor, booking, customer)
  }

  private async customerOf(actor: Actor): Promise<CustomerRef | null> {
    if (!this.passengers.customerByUserId) return null
    return this.passengers.customerByUserId(actor.userId)
  }

  private assertStarted(record: CheckInRecord, message: string): void {
    if (record.status === 'on_hold' || record.status === 'denied') {
      throw new CheckInError(409, 'ON_HOLD', 'Security is holding this check-in')
    }
    if (record.status !== 'started') throw invalidState(message)
  }

  /** A seat may still be changed after the pass was issued, so 'checked_in' is open too. */
  private assertOpen(record: CheckInRecord, message: string): void {
    if (record.status === 'on_hold' || record.status === 'denied') {
      throw new CheckInError(409, 'ON_HOLD', 'Security is holding this check-in')
    }
    if (record.status !== 'started' && record.status !== 'checked_in') throw invalidState(message)
  }

  private assertWindowOpen(flight: FlightRecord, window: Window): void {
    if (isWindowOpen(this.clock.now(), window)) return
    throw new CheckInError(409, 'WINDOW_CLOSED', 'Check-in is not open for this flight', {
      opensAt: window.opensAt.toISOString(),
      closesAt: window.closesAt.toISOString(),
    })
  }

  /** The same passport number may only be on the books once, unless it is the same person. */
  private async assertNotDuplicate(
    record: CheckInRecord,
    booking: BookingPassenger,
    mrz: MrzData,
    nationality2: string | null,
  ): Promise<void> {
    for (const row of await this.passengers.findByPassportNumber(mrz.number)) {
      if (row.id === record.passenger_id) continue
      const sameName =
        stripNonLetters(row.firstName) === stripNonLetters(booking.firstName) &&
        stripNonLetters(row.lastName) === stripNonLetters(booking.lastName)
      const sameBirth = !row.dateOfBirth || row.dateOfBirth === mrz.dateOfBirth
      const sameNationality = !row.nationality || !nationality2 || row.nationality.toLowerCase() === nationality2
      if (!sameName || !sameBirth || !sameNationality) {
        throw new CheckInError(409, 'DUPLICATE_DOCUMENT', 'This passport number belongs to another passenger', {
          numberLast4: mrz.numberLast4,
        })
      }
    }
  }

  private async upsertDocument(
    checkInId: string,
    values: {
      number_last4: string
      issuing_country: string
      nationality: string | null
      expiry_date: string
      visa_number: string | null
      name_mismatch: boolean
      profile_differences: string[]
    },
  ): Promise<TravelDocumentRecord> {
    const existing = await this.store.getDocumentByCheckIn(checkInId)
    if (existing) {
      // A new passport is a new document: the staff clearances of the old one do not carry over.
      return this.store.updateDocument(existing.id, {
        ...values,
        name_mismatch_cleared_at: null,
        name_mismatch_cleared_by: null,
        profile_differences_cleared_at: null,
        profile_differences_cleared_by: null,
        visa_checked_at: null,
        visa_checked_by: null,
      })
    }
    return this.store.createDocument({ check_in_id: checkInId, ...values })
  }

  private async viewOf(record: CheckInRecord): Promise<CheckInView> {
    const flight = await this.flightOf(record.flight_id)
    const window = await this.windowOf(flight)
    const booking = await this.bookingOf(record)
    const document = await this.store.getDocumentByCheckIn(record.id)
    const pass = (await this.store.passesForCheckIn(record.id))[0]
    return toCheckInView({
      checkIn: record,
      flight: toFlightSummary(flight, await this.gateOf(flight.id), window.boardingAt),
      window: toCheckInWindow(window, isWindowOpen(this.clock.now(), window)),
      booking: { pnr: booking.pnr, bookingPassengerId: record.booking_passenger_id },
      passenger: {
        id: record.passenger_id,
        firstName: booking.firstName,
        lastName: booking.lastName,
        cabin: booking.cabin,
        fareClass: booking.fareClass,
        specialAssistance: booking.specialAssistance,
      },
      document: document ? toDocumentView(document, await this.visaRequiredOf(document, flight)) : null,
      seat: await this.seatChoiceOf(record, booking),
      allowance: await this.allowanceOf(record, booking, flight.routeId),
      carryOn: await this.settings.carryOn(booking.cabin),
      boardingPassId: pass?.id ?? null,
    })
  }

  private async passView(record: CheckInRecord, pass: BoardingPassRecord): Promise<BoardingPassView> {
    const flight = await this.flightOf(record.flight_id)
    const window = await this.windowOf(flight)
    const gate = await this.gateOf(flight.id)
    const booking = await this.bookingOf(record)
    return toBoardingPassView({
      pass,
      checkIn: record,
      flight: toFlightSummary(flight, gate, window.boardingAt),
      seat: pass.seat_code,
      gate: gate?.code ?? null,
      boardingAt: window.boardingAt.toISOString(),
      passengerName: `${booking.firstName} ${booking.lastName}`,
      bags: record.declared_bags ?? 0,
    })
  }

  /** Whether the destination of the flight needs a visa for the nationality of the document. */
  private async visaRequiredOf(document: TravelDocumentRecord, flight: FlightRecord): Promise<boolean> {
    return this.settings.visaRequired(document.nationality ?? '', flight.destination.country)
  }

  /** Feature 4's checked allowance, the tier bonus and the size limit: the bags step shows them. */
  private allowanceOf(record: CheckInRecord, booking: BookingPassenger, routeId: string): Promise<BagAllowance> {
    return bagAllowance({
      pricing: this.pricing,
      tiers: this.tiers,
      settings: this.settings,
      fareClass: booking.fareClass,
      routeId,
      passengerId: record.passenger_id,
    })
  }

  private async seatChoiceOf(record: CheckInRecord, booking: BookingPassenger): Promise<SeatChoice | null> {
    const assigned = await this.seats.assigned(record.booking_passenger_id)
    if (!assigned) return null
    return {
      code: assigned.seatCode,
      type: assigned.type,
      fee: await this.pricing.seatFee(booking.cabin, assigned.type),
      paymentId: this.seatPayments.get(record.booking_passenger_id) ?? null,
    }
  }

  private async seatOf(flightId: string, seatCode: string): Promise<SeatMapSeat> {
    const map = await this.seats.seatMap(flightId, { bookingPassengerId: null, cabin: null })
    const seat = map.rows.flatMap((row) => row.seats).find((s) => s.code === seatCode)
    if (!seat) throw validation(`Seat ${seatCode} does not exist`, { seatCode })
    return seat
  }

  private async gateOf(flightId: string): Promise<{ id: string; code: string } | null> {
    const boarding = await this.store.flightBoarding(flightId)
    if (!boarding) return null
    const gate = await this.store.getGate(boarding.gate_id)
    return gate ? { id: gate.id, code: gate.code } : null
  }

  private async flightOf(flightId: string): Promise<FlightRecord> {
    const flight = await this.flights.byId(flightId)
    if (!flight) throw notFound('Flight')
    return flight
  }

  private async bookingOf(record: CheckInRecord): Promise<BookingPassenger> {
    const booking = await this.bookings.byBookingPassengerId(record.booking_passenger_id)
    if (!booking) throw notFound('Booking')
    return booking
  }

  private async windowOf(flight: FlightRecord): Promise<Window> {
    return computeWindow(flight.depAt, await this.settings.window())
  }

  private async record(
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
    isSensitive = false,
  ): Promise<void> {
    await this.audit.record({
      actorType: actor.staffId ? 'staff' : 'customer',
      actorId: actor.userId,
      action,
      entityType,
      entityId,
      summary,
      isSensitive,
    })
  }
}
