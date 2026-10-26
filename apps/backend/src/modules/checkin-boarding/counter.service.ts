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
import { allocateExcess, bagTagNumber, carryOnResult, checkedBagRefusal, excessFee, roundKg } from './domain/baggage'
import { computeWindow } from './domain/window'
import { CheckInError, invalidState, notFound, validation } from './errors'
import { toBagView, toFlightSummary, toStaffCheckInView, toStaffRow } from './mappers'
import { AUDIT, BOOKINGS, CLOCK, FLIGHTS, PAYMENTS, PRICING, SETTINGS, TIERS } from './providers/providers'
import type {
  AuditProvider,
  BookingPassenger,
  BookingProvider,
  ClockProvider,
  FlightProvider,
  FlightRecord,
  PaymentProvider,
  PricingProvider,
  SettingsProvider,
  TierProvider,
} from './providers/providers'
import type { CheckedBagRecord, CheckInRecord } from './store/checkin-store'
import { CheckInStore } from './store/checkin-store'

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
    @Inject(PRICING) private readonly pricing: PricingProvider,
    @Inject(TIERS) private readonly tiers: TierProvider,
    @Inject(SETTINGS) private readonly settings: SettingsProvider,
    @Inject(PAYMENTS) private readonly payments: PaymentProvider,
    @Inject(AUDIT) private readonly audit: AuditProvider,
    private readonly checkins: CheckInService,
    private readonly store: CheckInStore,
  ) {}

  /** The issue list of the counter: every check-in of a flight, a PNR or a name. */
  async search(actor: Actor, query: { flightId?: string; pnr?: string; name?: string }): Promise<StaffCheckInRow[]> {
    this.staffIdOf(actor)
    const rows: StaffCheckInRow[] = []
    for (const record of this.store.searchCheckIns(query)) {
      const flight = await this.flights.byId(record.flight_id)
      rows.push(
        toStaffRow({
          checkIn: record,
          flightNumber: flight?.flightNumber ?? '',
          issues: this.issuesOf(record, this.bagsOf(record)),
        }),
      )
    }
    return rows
  }

  /** Everything the counter screen shows for one passenger. */
  async detail(actor: Actor, checkInId: string): Promise<StaffCheckInView> {
    this.staffIdOf(actor)
    const record = this.requireCheckIn(checkInId)
    const booking = await this.bookingOf(record)
    const bags = this.bagsOf(record)
    const checkIn = await this.checkins.get(actor, record.id)
    const boardingPass = checkIn.boardingPassId ? await this.checkins.boardingPass(actor, record.id) : null
    return toStaffCheckInView({
      checkIn,
      bags: bags.map(toBagView),
      allowance: await this.allowanceOf(record, booking),
      carryOn: await this.settings.carryOn(booking.cabin),
      carryOnCheck: this.store.getCarryOnCheck(record.id),
      issues: this.issuesOf(record, bags),
      totals: this.totalsOf(bags),
      boardingPass,
      isPolice: booking.isPolice,
    })
  }

  /** Weights a bag and writes down the excess it added to the passenger's allowance. */
  async weighBag(actor: Actor, checkInId: string, input: BagInput): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const record = this.requireCheckIn(checkInId)
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
    const bags = this.bagsOf(record)
    const excess = allocateExcess([...bags.map((b) => b.weight_kg), weight], allowance.freeKg + allowance.tierBonusKg)
    const excessKg = excess[excess.length - 1]
    const bag = this.store.createBag({
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
    const bag = this.store.getBag(bagId)
    if (!bag || bag.deleted_at) throw notFound('Bag')
    if (bag.status === 'tagged') throw invalidState('A tagged bag cannot be removed')
    const record = this.requireCheckIn(bag.check_in_id)
    this.store.deleteBag(bagId)

    const booking = await this.bookingOf(record)
    const allowance = await this.allowanceOf(record, booking)
    const bags = this.bagsOf(record)
    const excess = allocateExcess(
      bags.map((b) => b.weight_kg),
      allowance.freeKg + allowance.tierBonusKg,
    )
    bags.forEach((remaining, index) => {
      if (remaining.excess_payment_id) return
      const kg = excess[index]
      const fee = excessFee(kg, remaining.rate_per_kg)
      if (kg !== remaining.excess_kg || fee !== remaining.excess_fee) {
        this.store.updateBag(remaining.id, { excess_kg: kg, excess_fee: fee })
      }
    })
    await this.record(actor, 'checked_bag.remove', 'checked_bag', bagId, 'bag removed')
    return this.detail(actor, record.id)
  }

  /** Tags a bag. The unpaid excess of the passenger is charged first, so the button pays and prints in one go. */
  async tagBag(actor: Actor, bagId: string): Promise<{ bag: CheckedBagView; view: StaffCheckInView }> {
    this.staffIdOf(actor)
    const bag = this.store.getBag(bagId)
    if (!bag || bag.deleted_at) throw notFound('Bag')
    const record = this.requireCheckIn(bag.check_in_id)
    if (bag.status === 'tagged') {
      return { bag: toBagView(bag), view: await this.detail(actor, record.id) }
    }

    const bags = this.bagsOf(record)
    const unpaid = bags.filter((b) => b.excess_fee > 0 && !b.excess_payment_id)
    if (unpaid.length > 0) {
      const amount = Math.round(unpaid.reduce((sum, b) => sum + b.excess_fee, 0) * 100) / 100
      const charge = await this.payments.charge({ amount, currency: 'THB', purpose: 'excess_baggage', reference: record.id })
      // Bags paid together share one payment id.
      for (const other of bags) {
        if (!other.excess_payment_id) this.store.updateBag(other.id, { excess_payment_id: charge.paymentId })
      }
    }

    const airlineNumber = await this.settings.bagTagAirlineNumber()
    const tagged = this.store.updateBag(bagId, {
      tag_number: bagTagNumber(airlineNumber, this.store.nextBagTagSeq()),
      status: 'tagged',
    })
    await this.record(actor, 'checked_bag.tag', 'checked_bag', bagId, `bag tagged ${tagged.tag_number}`)
    return { bag: toBagView(tagged), view: await this.detail(actor, record.id) }
  }

  /** Feature 10 looks a bag up by the number on its tag. */
  async bagByTag(actor: Actor, tagNumber: string): Promise<BagLookup> {
    this.staffIdOf(actor)
    const bag = this.store.findBagByTag(tagNumber)
    if (!bag) throw notFound('Bag')
    return this.lookupOf(bag, this.requireCheckIn(bag.check_in_id))
  }

  /** Every bag on a flight, for feature 10. */
  async bagsByFlight(actor: Actor, flightId: string): Promise<BagLookup[]> {
    this.staffIdOf(actor)
    const lookups: BagLookup[] = []
    for (const record of this.store.listCheckInsByFlight(flightId)) {
      for (const bag of this.bagsOf(record)) {
        lookups.push(await this.lookupOf(bag, record))
      }
    }
    return lookups
  }

  /** Weighs the carry-on at the counter: too big or too heavy means it travels as a checked bag. */
  async carryOn(actor: Actor, checkInId: string, input: BagInput): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const record = this.requireCheckIn(checkInId)
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
    this.store.upsertCarryOnCheck({
      check_in_id: record.id,
      weight_kg: weight,
      within_size: result.withinSize,
      result: result.result,
      staff_id: staffId,
    })
    await this.record(actor, 'carry_on.check', 'check_in', record.id, `carry-on ${result.result}`)
    return this.detail(actor, record.id)
  }

  /** Clears a name mismatch from the issue list. */
  async clearMismatch(actor: Actor, documentId: string): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const document = this.store.getDocument(documentId)
    if (!document) throw notFound('Travel document')
    if (!document.name_mismatch || document.name_mismatch_cleared_at) {
      throw invalidState('There is no name mismatch to clear')
    }
    this.store.updateDocument(documentId, {
      name_mismatch_cleared_by: staffId,
      name_mismatch_cleared_at: this.clock.now(),
    })
    await this.record(actor, 'travel_document.clear_mismatch', 'travel_document', documentId, 'name mismatch cleared')
    return this.detail(actor, document.check_in_id)
  }

  /** Marks the visa of the passenger as checked by staff. */
  async checkVisa(actor: Actor, documentId: string): Promise<StaffCheckInView> {
    const staffId = this.staffIdOf(actor)
    const document = this.store.getDocument(documentId)
    if (!document) throw notFound('Travel document')
    this.store.updateDocument(documentId, { visa_checked_by: staffId, visa_checked_at: this.clock.now() })
    await this.record(actor, 'travel_document.check_visa', 'travel_document', documentId, 'visa checked')
    return this.detail(actor, document.check_in_id)
  }

  /** Prints the boarding pass. A reprint keeps the first printed_at. */
  async printPass(actor: Actor, passId: string): Promise<BoardingPassView> {
    this.staffIdOf(actor)
    const pass = this.store.getPass(passId)
    if (!pass) throw notFound('Boarding pass')
    if (!pass.printed_at) this.store.updatePass(passId, { printed_at: this.clock.now() })
    await this.record(actor, 'boarding_pass.print', 'boarding_pass', passId, 'boarding pass printed')
    return this.checkins.boardingPass(actor, this.requireCheckIn(pass.check_in_id).id)
  }

  /** The counter is a staff screen: a customer token may not read it. */
  private staffIdOf(actor: Actor): string {
    if (actor.staffId === null) throw new CheckInError(403, 'FORBIDDEN', 'The counter is for staff only')
    return actor.staffId
  }

  private requireCheckIn(checkInId: string): CheckInRecord {
    const record = this.store.getCheckIn(checkInId)
    if (!record) throw notFound('Check-in')
    return record
  }

  private bagsOf(record: CheckInRecord): CheckedBagRecord[] {
    return [...this.store.listBags(record.id)].sort((a, b) => (a.weighed_at?.getTime() ?? 0) - (b.weighed_at?.getTime() ?? 0))
  }

  private async allowanceOf(record: CheckInRecord, booking: BookingPassenger): Promise<BagAllowance> {
    const flight = await this.flightOf(record.flight_id)
    const pricing = await this.pricing.baggage(booking.fareClass, flight.routeId)
    const tier = await this.tiers.tier(record.passenger_id)
    return {
      freeKg: pricing.freeKg,
      tierBonusKg: tier?.bagBonusKg ?? 0,
      ratePerKg: pricing.ratePerKg,
      maxBagKg: pricing.maxBagKg,
      maxLinearCm: await this.settings.checkedBagMaxLinearCm(),
    }
  }

  private totalsOf(bags: CheckedBagRecord[]): { weightKg: number; excessKg: number; unpaidFee: number } {
    return {
      weightKg: roundKg(bags.reduce((sum, b) => sum + b.weight_kg, 0)),
      excessKg: roundKg(bags.reduce((sum, b) => sum + b.excess_kg, 0)),
      unpaidFee: Math.round(bags.filter((b) => !b.excess_payment_id).reduce((sum, b) => sum + b.excess_fee, 0) * 100) / 100,
    }
  }

  private issuesOf(record: CheckInRecord, bags: CheckedBagRecord[]): IssueCode[] {
    const issues: IssueCode[] = []
    const document = this.store.getDocumentByCheckIn(record.id)
    if (record.status === 'on_hold' || record.status === 'denied') issues.push('ON_HOLD')
    if (bags.some((b) => b.excess_fee > 0 && !b.excess_payment_id)) issues.push('EXCESS_UNPAID')
    if (document?.name_mismatch && !document.name_mismatch_cleared_at) issues.push('NAME_MISMATCH')
    if (document?.visa_required && document.visa_number && !document.visa_checked_at) issues.push('VISA_CHECK')
    if (document && document.profile_differences.length > 0) issues.push('PROFILE_DIFFERS')
    return issues
  }

  private async lookupOf(bag: CheckedBagRecord, record: CheckInRecord): Promise<BagLookup> {
    return {
      bag: toBagView(bag),
      passengerName: record.passenger_name,
      pnr: record.pnr,
      flight: await this.flightSummaryOf(record.flight_id),
    }
  }

  private async flightSummaryOf(flightId: string): Promise<FlightSummary> {
    const flight = await this.flightOf(flightId)
    const window = computeWindow(flight.depAt, await this.settings.window())
    const boarding = this.store.flightBoarding(flightId)
    const gate = boarding ? this.store.getGate(boarding.gate_id) : null
    return toFlightSummary(flight, gate ? { id: gate.id, code: gate.code } : null, window.boardingAt)
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
