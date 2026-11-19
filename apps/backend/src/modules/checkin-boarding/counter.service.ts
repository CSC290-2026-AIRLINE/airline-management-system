import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from './actor'
import type {
  BagAllowance,
  BagLookup,
  BoardingPassView,
  CheckedBagView,
  FlightSummary,
  IssueCode,
  StaffCheckInRow,
  StaffCheckInView,
} from './api-types'
import { CheckInService } from './checkin.service'
import { bagAllowance } from './domain/allowance'
import { allocateExcess, bagTagNumber, carryOnResult, checkedBagRefusal, excessFee, roundKg } from './domain/baggage'
import { computeWindow } from './domain/window'
import { CheckInError, invalidState, notFound, validation } from './errors'
import { toBagView, toFlightSummary, toStaffCheckInView, toStaffRow } from './mappers'
import { AUDIT, BOOKINGS, CLOCK, FLIGHTS, PAYMENTS, PRICING, SEATS, SETTINGS, TIERS } from './providers/providers'
import type {
  AuditProvider,
  BookingPassenger,
  BookingProvider,
  ClockProvider,
  FlightProvider,
  FlightRecord,
  PaymentProvider,
  PricingProvider,
  SeatProvider,
  SettingsProvider,
  TierProvider,
} from './providers/providers'
import type { CheckedBagRecord, CheckInRecord, TravelDocumentRecord, UpdateDocumentPatch } from './store/checkin-store'
import { CHECKIN_REPOSITORY } from './store/checkin-repository'
import type { CheckInRepository } from './store/checkin-repository'

/** The bags in the order they were weighed: the excess of each one depends on the ones before it. */
const sortByWeighed = (bags: CheckedBagRecord[]): CheckedBagRecord[] =>
  [...bags].sort((a, b) => (a.weighed_at?.getTime() ?? 0) - (b.weighed_at?.getTime() ?? 0))

/** A coupon is one booking passenger on one flight: a return trip has two. */
const couponKey = (bookingPassengerId: string, flightId: string): string => `${bookingPassengerId}:${flightId}`

export interface BagInput {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

/**
 * The counter of feature 6: the agent weighs the bags, checks the carry-on, tags the bags and works through the
 * issue list. Every rule lives in domain/, the other features sit behind a provider.
 */
@Injectable()
export class CounterService {
  constructor(
    @Inject(CLOCK) private readonly clock: ClockProvider,
    @Inject(FLIGHTS) private readonly flights: FlightProvider,
    @Inject(BOOKINGS) private readonly bookings: BookingProvider,
    @Inject(SEATS) private readonly seats: SeatProvider,
    @Inject(PRICING) private readonly pricing: PricingProvider,
    @Inject(TIERS) private readonly tiers: TierProvider,
    @Inject(SETTINGS) private readonly settings: SettingsProvider,
    @Inject(PAYMENTS) private readonly payments: PaymentProvider,
    @Inject(AUDIT) private readonly audit: AuditProvider,
    private readonly checkins: CheckInService,
    @Inject(CHECKIN_REPOSITORY) private readonly store: CheckInRepository,
  ) {}

  /**
   * The passenger list of the counter. A search (a flight, a booking ref or a name) lists the booked passengers,
   * also the ones who have not started a check-in; with nothing to search for the list is every check-in.
   */
  async search(actor: Actor, query: { flightId?: string; pnr?: string; name?: string }): Promise<StaffCheckInRow[]> {
    this.staffIdOf(actor)
    const found = await this.store.searchCheckIns(query)
    const searching = Boolean(query.flightId || query.pnr?.trim() || query.name?.trim())
    const booked = searching
      ? await this.bookings.search(query)
      : (await Promise.all(found.map((r) => this.bookings.byBookingPassengerId(r.booking_passenger_id, r.flight_id)))).filter(
          (b) => b !== null,
        )
    const bookingOf = new Map(booked.map((b) => [couponKey(b.bookingPassengerId, b.flightId), b]))
    // One read per table and per flight for the whole list, not one per passenger: a full flight is a few hundred rows.
    const flightIds = [...new Set(booked.map((b) => b.flightId))]
    const [flights, seats] = await Promise.all([
      this.flights.byIds(flightIds),
      Promise.all(flightIds.map((id) => this.seats.assignedSeats(id))),
    ])
    const flightOf = new Map(flights.map((flight) => [flight.id, flight]))
    const seatsOf = new Map(flightIds.map((id, index) => [id, seats[index]]))

    const records: CheckInRecord[] = []
    for (const record of found) {
      const booking = bookingOf.get(couponKey(record.booking_passenger_id, record.flight_id))
      if (booking) records.push(await this.upToDate(actor, record, booking, flightOf.get(record.flight_id)))
    }
    const ids = records.map((record) => record.id)
    const [documents, bags] = await Promise.all([this.store.documentsForCheckIns(ids), this.store.bagsForCheckIns(ids)])

    const rowOf = (booking: BookingPassenger, record: CheckInRecord | null): StaffCheckInRow =>
      toStaffRow({
        id: record?.id ?? null,
        bookingPassengerId: booking.bookingPassengerId,
        flightId: booking.flightId,
        pnr: booking.pnr,
        passengerName: `${booking.firstName} ${booking.lastName}`,
        flightNumber: flightOf.get(booking.flightId)?.flightNumber ?? '',
        seat: seatsOf.get(booking.flightId)?.get(booking.bookingPassengerId) ?? null,
        status: record?.status ?? 'not_started',
        issues: record
          ? this.issuesOf(
              record,
              documents.find((d) => d.check_in_id === record.id) ?? null,
              sortByWeighed(bags.filter((b) => b.check_in_id === record.id)),
            )
          : [],
      })
    const rows = records.map((record) => rowOf(bookingOf.get(couponKey(record.booking_passenger_id, record.flight_id))!, record))
    // The booked passengers nobody checked in yet; a cancelled booking that never started is not on the list.
    const started = new Set(records.map((record) => couponKey(record.booking_passenger_id, record.flight_id)))
    for (const booking of booked) {
      if (!booking.cancelled && !started.has(couponKey(booking.bookingPassengerId, booking.flightId))) rows.push(rowOf(booking, null))
    }
    return rows
  }

  /** The agent starts the check-in of a booked passenger who has not started one online. */
  async start(actor: Actor, input: { bookingPassengerId: string; flightId: string }): Promise<StaffCheckInView> {
    this.staffIdOf(actor)
    const started = await this.checkins.startCoupon(actor, input.bookingPassengerId, input.flightId)
    return this.detail(actor, started.id)
  }

  /** Everything the counter screen shows for one passenger. */
  async detail(actor: Actor, checkInId: string): Promise<StaffCheckInView> {
    this.staffIdOf(actor)
    const record = await this.checkins.refreshHold(actor, await this.requireCheckIn(actor, checkInId))
    const booking = await this.bookingOf(record)
    const bags = await this.bagsOf(record)
    const checkIn = await this.checkins.get(actor, record.id)
    const boardingPass = checkIn.boardingPassId ? await this.checkins.boardingPass(actor, record.id) : null
    return toStaffCheckInView({
      checkIn,
      bags: bags.map(toBagView),
      // The check-in view already carries the allowance and the carry-on rule of the cabin.
      allowance: checkIn.allowance,
      carryOn: checkIn.carryOn,
      carryOnCheck: await this.store.getCarryOnCheck(record.id),
      issues: this.issuesOf(record, await this.store.getDocumentByCheckIn(record.id), bags),
      totals: this.totalsOf(bags),
      boardingPass,
      isPolice: booking.isPolice,
    })
  }

  /** Weights a bag and writes down the excess it added to the passenger's allowance. */
  async weighBag(actor: Actor, checkInId: string, input: BagInput): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const record = await this.requireCheckIn(actor, checkInId)
    if (record.status !== 'started' && record.status !== 'checked_in') {
      throw invalidState('Bags can only be weighed while the check-in is open')
    }
    const weight = roundKg(input.weightKg)
    if (!Number.isFinite(weight) || weight <= 0) {
      throw validation('The bag weight must be a positive number', { weightKg: input.weightKg })
    }
    const dimensions = [input.lengthCm, input.widthCm, input.heightCm]
    if (dimensions.some((d) => !Number.isFinite(d) || d <= 0)) {
      throw validation('The bag dimensions must be positive numbers', {
        lengthCm: input.lengthCm,
        widthCm: input.widthCm,
        heightCm: input.heightCm,
      })
    }

    const booking = await this.bookingOf(record)
    const allowance = await this.allowanceOf(record, booking)
    const refusal = checkedBagRefusal(
      { weightKg: weight, lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm },
      { maxBagKg: allowance.maxBagKg, maxLinearCm: allowance.maxLinearCm },
    )
    if (refusal) {
      throw new CheckInError(
        422,
        'BAG_REFUSED',
        refusal === 'overweight'
          ? `The bag is over the ${allowance.maxBagKg} kg limit`
          : `The bag is over the ${allowance.maxLinearCm} cm size limit`,
        { reason: refusal, maxBagKg: allowance.maxBagKg, maxLinearCm: allowance.maxLinearCm },
      )
    }

    // The new bag is weighed last, so the bags before it keep the excess they added.
    const bags = await this.bagsOf(record)
    const excess = allocateExcess([...bags.map((b) => b.weight_kg), weight], allowance.freeKg + allowance.tierBonusKg)
    const excessKg = excess[excess.length - 1]
    const bag = await this.store.createBag({
      check_in_id: record.id,
      weight_kg: weight,
      excess_kg: excessKg,
      rate_per_kg: allowance.ratePerKg,
      excess_fee: excessFee(excessKg, allowance.ratePerKg),
      weighed_by: staffId,
    })
    await this.record(actor, 'checked_bag.weigh', 'checked_bag', bag.id, `bag weighed ${weight} kg`)
    return this.detail(actor, record.id)
  }

  /** Removes a bag weighed by mistake. A tagged bag is never removed. */
  async removeBag(actor: Actor, bagId: string): Promise<StaffCheckInView> {
    this.staffIdOf(actor)
    const bag = await this.store.getBag(bagId)
    if (!bag || bag.deleted_at) throw notFound('Bag')
    // The gate offloads the bags of a no-show, so the tag is the guard and not the status.
    if (bag.tag_number !== null || bag.status !== 'weighed') throw invalidState('A tagged bag cannot be removed')
    if (bag.excess_payment_id) throw invalidState('A paid bag cannot be removed; refund through Feature 5')
    const record = await this.requireCheckIn(actor, bag.check_in_id)
    await this.store.deleteBag(bagId)

    const booking = await this.bookingOf(record)
    const allowance = await this.allowanceOf(record, booking)
    const bags = await this.bagsOf(record)
    const excess = allocateExcess(
      bags.map((b) => b.weight_kg),
      allowance.freeKg + allowance.tierBonusKg,
    )
    for (const [index, remaining] of bags.entries()) {
      if (remaining.excess_payment_id) continue
      const kg = excess[index]
      const fee = excessFee(kg, remaining.rate_per_kg)
      if (kg !== remaining.excess_kg || fee !== remaining.excess_fee) {
        await this.store.updateBag(remaining.id, { excess_kg: kg, excess_fee: fee })
      }
    }
    await this.record(actor, 'checked_bag.remove', 'checked_bag', bagId, 'bag removed')
    return this.detail(actor, record.id)
  }

  /** Tags a bag. A bag with an unpaid excess fee is refused `EXCESS_UNPAID`: the agent takes the money first (`payExcess`). */
  async tagBag(actor: Actor, bagId: string): Promise<{ bag: CheckedBagView; view: StaffCheckInView }> {
    this.staffIdOf(actor)
    const bag = await this.store.getBag(bagId)
    if (!bag || bag.deleted_at) throw notFound('Bag')
    const record = await this.requireCheckIn(actor, bag.check_in_id)
    if (record.status !== 'started' && record.status !== 'checked_in') {
      throw invalidState('Bags can only be tagged while the check-in is open')
    }
    if (bag.status === 'tagged') {
      return { bag: toBagView(bag), view: await this.detail(actor, record.id) }
    }
    if (bag.excess_fee > 0 && !bag.excess_payment_id) {
      throw new CheckInError(409, 'EXCESS_UNPAID', 'The excess fee of this bag is not paid', { bagId, fee: bag.excess_fee })
    }

    const airlineNumber = await this.settings.bagTagAirlineNumber()
    const tagged = await this.store.updateBag(bagId, {
      tag_number: bagTagNumber(airlineNumber, await this.store.nextBagTagSeq()),
      status: 'tagged',
    })
    await this.record(actor, 'checked_bag.tag', 'checked_bag', bagId, `bag tagged ${tagged.tag_number}`)
    return { bag: toBagView(tagged), view: await this.detail(actor, record.id) }
  }

  /** The agent took the excess fee: every unpaid bag of the check-in is charged in one payment. */
  async payExcess(actor: Actor, checkInId: string): Promise<StaffCheckInView> {
    this.staffIdOf(actor)
    const record = await this.requireCheckIn(actor, checkInId)
    if (record.status !== 'started' && record.status !== 'checked_in') {
      throw invalidState('Excess can only be paid while the check-in is open')
    }
    const bags = await this.bagsOf(record)
    const unpaid = bags.filter((b) => b.excess_fee > 0 && !b.excess_payment_id)
    if (unpaid.length > 0) {
      const amount = Math.round(unpaid.reduce((sum, b) => sum + b.excess_fee, 0) * 100) / 100
      const booking = await this.bookingOf(record)
      // The reference counts the payments of this check-in: the first one is 1, the next one is 2.
      const payments = new Set(bags.filter((b) => b.excess_payment_id !== null).map((b) => b.excess_payment_id)).size
      const charge = await this.payments.charge({
        amount,
        currency: 'THB',
        purpose: 'excess_baggage',
        reference: `check_in:${record.id}:bags:${payments + 1}`,
        bookingId: booking.bookingId,
      })
      // Bags paid together share one payment id.
      for (const other of unpaid) {
        await this.store.updateBag(other.id, { excess_payment_id: charge.paymentId })
      }
      await this.record(actor, 'checked_bag.pay_excess', 'check_in', record.id, `excess of ${unpaid.length} bag(s) paid, ${amount} THB`)
    }
    return this.detail(actor, record.id)
  }

  /** Feature 10 looks a bag up by the number on its tag. */
  async bagByTag(actor: Actor, tagNumber: string): Promise<BagLookup> {
    this.staffIdOf(actor)
    const bag = await this.store.findBagByTag(tagNumber)
    if (!bag) throw notFound('Bag')
    return this.lookupOf(bag, await this.requireCheckIn(actor, bag.check_in_id))
  }

  /** Every bag on a flight, for feature 10. */
  async bagsByFlight(actor: Actor, flightId: string): Promise<BagLookup[]> {
    this.staffIdOf(actor)
    const lookups: BagLookup[] = []
    const records = await this.store.listCheckInsByFlight(flightId)
    const bags = sortByWeighed(await this.store.bagsForCheckIns(records.map((record) => record.id)))
    for (const record of records) {
      for (const bag of bags.filter((b) => b.check_in_id === record.id)) {
        lookups.push(await this.lookupOf(bag, record))
      }
    }
    return lookups
  }

  /** Weighs the carry-on at the counter: too big or too heavy means it travels as a checked bag. */
  async carryOn(actor: Actor, checkInId: string, input: BagInput): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const record = await this.requireCheckIn(actor, checkInId)
    this.assertNotCancelled(record)
    const weight = roundKg(input.weightKg)
    if (!Number.isFinite(weight) || weight <= 0) {
      throw validation('The carry-on weight must be a positive number', { weightKg: input.weightKg })
    }
    const booking = await this.bookingOf(record)
    const allowance = await this.settings.carryOn(booking.cabin)
    const result = carryOnResult(
      { weightKg: weight, lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm },
      allowance,
    )
    await this.store.upsertCarryOnCheck({
      check_in_id: record.id,
      weight_kg: weight,
      within_size: result.withinSize,
      result: result.result,
      staff_id: staffId,
    })
    await this.record(actor, 'carry_on.check', 'check_in', record.id, `carry-on ${result.result}`)
    return this.detail(actor, record.id)
  }

  /** Clears the flags of a document: the name mismatch and the profile differences, one staff action. */
  async clearMismatch(actor: Actor, documentId: string): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const document = await this.store.getDocument(documentId)
    if (!document) throw notFound('Travel document')
    const nameUncleared = document.name_mismatch && !document.name_mismatch_cleared_at
    const differencesUncleared = document.profile_differences.length > 0 && !document.profile_differences_cleared_at
    if (!nameUncleared && !differencesUncleared) throw invalidState('There is nothing to clear on this document')
    const clearedAt = this.clock.now()
    const patch: UpdateDocumentPatch = {}
    if (nameUncleared) {
      patch.name_mismatch_cleared_by = staffId
      patch.name_mismatch_cleared_at = clearedAt
    }
    if (differencesUncleared) {
      patch.profile_differences_cleared_by = staffId
      patch.profile_differences_cleared_at = clearedAt
    }
    await this.store.updateDocument(documentId, patch)
    await this.record(actor, 'travel_document.clear_mismatch', 'travel_document', documentId, 'document flags cleared')
    return this.detail(actor, document.check_in_id)
  }

  /** Marks the visa of the passenger as checked by staff. */
  async checkVisa(actor: Actor, documentId: string): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const document = await this.store.getDocument(documentId)
    if (!document) throw notFound('Travel document')
    await this.store.updateDocument(documentId, { visa_checked_by: staffId, visa_checked_at: this.clock.now() })
    await this.record(actor, 'travel_document.check_visa', 'travel_document', documentId, 'visa checked')
    return this.detail(actor, document.check_in_id)
  }

  /** Prints the boarding pass. A reprint keeps the first printed_at. */
  async printPass(actor: Actor, passId: string): Promise<BoardingPassView> {
    this.staffIdOf(actor)
    const pass = await this.store.getPass(passId)
    if (!pass) throw notFound('Boarding pass')
    const record = await this.requireCheckIn(actor, pass.check_in_id)
    this.assertNotCancelled(record)
    if (!pass.printed_at) await this.store.updatePass(passId, { printed_at: this.clock.now() })
    await this.record(actor, 'boarding_pass.print', 'boarding_pass', passId, 'boarding pass printed')
    return this.checkins.boardingPass(actor, record.id)
  }

  /** The counter is a staff screen: a customer token may not read it. */
  private staffIdOf(actor: Actor): string {
    if (actor.staffId === null) throw new CheckInError(403, 'FORBIDDEN', 'The counter is for staff only')
    return actor.staffId
  }

  /** The check-in, cancelled first when its flight or booking was cancelled since: features 2 and 3 do not call us. */
  private async requireCheckIn(actor: Actor, checkInId: string): Promise<CheckInRecord> {
    const record = await this.store.getCheckIn(checkInId)
    if (!record) throw notFound('Check-in')
    return this.checkins.refreshCancelled(actor, record)
  }

  private assertNotCancelled(record: CheckInRecord): void {
    if (record.status === 'cancelled') throw invalidState('This check-in is cancelled')
  }

  /** A row of the list follows a cancelled flight or booking and a hold security has lifted, like the detail does. */
  private async upToDate(
    actor: Actor,
    record: CheckInRecord,
    booking: BookingPassenger,
    flight: FlightRecord | undefined,
  ): Promise<CheckInRecord> {
    const current = booking.cancelled || flight?.status === 'cancelled' ? await this.checkins.refreshCancelled(actor, record) : record
    return this.checkins.refreshHold(actor, current)
  }

  private async bagsOf(record: CheckInRecord): Promise<CheckedBagRecord[]> {
    return sortByWeighed(await this.store.listBags(record.id))
  }

  private async allowanceOf(record: CheckInRecord, booking: BookingPassenger): Promise<BagAllowance> {
    const flight = await this.flightOf(record.flight_id)
    return bagAllowance({
      pricing: this.pricing,
      tiers: this.tiers,
      settings: this.settings,
      fareClass: booking.fareClass,
      routeId: flight.routeId,
      passengerId: record.passenger_id,
    })
  }

  private totalsOf(bags: CheckedBagRecord[]): { weightKg: number; excessKg: number; unpaidFee: number } {
    return {
      weightKg: roundKg(bags.reduce((sum, b) => sum + b.weight_kg, 0)),
      excessKg: roundKg(bags.reduce((sum, b) => sum + b.excess_kg, 0)),
      unpaidFee: Math.round(bags.filter((b) => !b.excess_payment_id).reduce((sum, b) => sum + b.excess_fee, 0) * 100) / 100,
    }
  }

  private issuesOf(record: CheckInRecord, document: TravelDocumentRecord | null, bags: CheckedBagRecord[]): IssueCode[] {
    const issues: IssueCode[] = []
    if (record.status === 'on_hold' || record.status === 'denied') issues.push('ON_HOLD')
    if (bags.some((b) => b.excess_fee > 0 && !b.excess_payment_id)) issues.push('EXCESS_UNPAID')
    if (document?.name_mismatch && !document.name_mismatch_cleared_at) issues.push('NAME_MISMATCH')
    if (document?.visa_number && !document.visa_checked_at) issues.push('VISA_CHECK')
    if (document && document.profile_differences.length > 0 && !document.profile_differences_cleared_at) {
      issues.push('PROFILE_DIFFERS')
    }
    return issues
  }

  private async lookupOf(bag: CheckedBagRecord, record: CheckInRecord): Promise<BagLookup> {
    const booking = await this.bookingOf(record)
    return {
      bag: toBagView(bag),
      passengerName: `${booking.firstName} ${booking.lastName}`,
      pnr: booking.pnr,
      flight: await this.flightSummaryOf(record.flight_id),
    }
  }

  private async flightSummaryOf(flightId: string): Promise<FlightSummary> {
    const flight = await this.flightOf(flightId)
    const window = computeWindow(flight.depAt, await this.settings.window())
    const boarding = await this.store.flightBoarding(flightId)
    const gate = boarding ? await this.store.getGate(boarding.gate_id) : null
    return toFlightSummary(flight, gate ? { id: gate.id, code: gate.code } : null, window.boardingAt)
  }

  private async flightOf(flightId: string): Promise<FlightRecord> {
    const flight = await this.flights.byId(flightId)
    if (!flight) throw notFound('Flight')
    return flight
  }

  private async bookingOf(record: CheckInRecord): Promise<BookingPassenger> {
    const booking = await this.bookings.byBookingPassengerId(record.booking_passenger_id, record.flight_id)
    if (!booking) throw notFound('Booking')
    return booking
  }

  private async record(actor: Actor, action: string, entityType: string, entityId: string, summary: string): Promise<void> {
    await this.audit.record({
      actorType: actor.staffId ? 'staff' : 'customer',
      actorId: actor.userId,
      action,
      entityType,
      entityId,
      summary,
    })
  }
}
