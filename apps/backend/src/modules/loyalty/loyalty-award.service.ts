import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { CABINS, awardFlightStatus, awardOffer, checkRelease, isOpenFlight, type ReleaseRefusal } from './domain/award-release'
import { addDays, addHours } from './domain/dates'
import { awardLimitOnReturnToCash, draftRedemption, draftReversals, type RedeemRefusal } from './domain/redemption'
import type { LedgerRow } from './domain/types'
import type { AwardAvailabilityDto, AwardFlightDto, RedeemResultDto, ReversalResultDto } from './dto/responses'
import { AWARD_SEAT_PORT, type AwardSeatPort } from './award-seats.port'
import type { LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyError, invalid, isCheckViolation } from './loyalty-error'
import { LoyaltyDataService } from './loyalty-data.service'

type Tx = Prisma.TransactionClient

/** Feature 3's party: a lap infant takes no award seat. */
export interface AwardParty {
  adults: number
  children: number
  infants: number
}

export interface AwardFlightRequest {
  flightId: string
  /** Leave out for every released cabin of the flight. */
  cabin?: string
}

/** Award seats per run of the return-to-cash job, so one run never locks every cabin at once. */
const RETURN_BATCH = 200

const FLIGHT_LIST_LIMIT = 200

const FLIGHT_SELECT = {
  id: true,
  flight_number: true,
  dep_at: true,
  status: true,
  route: { select: { origin: true, destination: true } },
  aircraft: { select: { aircraft_type: { select: { code: true, model: true } } } },
  seat_inventory: {
    select: {
      cabin: true,
      capacity: true,
      award_limit: true,
      award_held_count: true,
      award_sold_count: true,
      loyalty_award_release: { select: { miles_cost: true } },
    },
  },
} satisfies Prisma.flightSelect

type FlightRow = Prisma.flightGetPayload<{ select: typeof FLIGHT_SELECT }>

const RELEASE_REFUSAL: Record<ReleaseRefusal, (taken: number, cutoff: number) => LoyaltyError> = {
  flight_closed: () => new LoyaltyError(HttpStatus.CONFLICT, 'AWARD_CLOSED', 'This flight has departed or is cancelled.'),
  past_cutoff: (_, cutoff) => new LoyaltyError(HttpStatus.CONFLICT, 'AWARD_CLOSED', `Award seats closed ${cutoff} hours before departure.`),
  bad_seats: () => invalid('seats', 'Seats must be a whole number, 0 or more.'),
  bad_miles: () => invalid('milesCost', 'Miles per seat must be a whole number above 0.'),
  below_taken: (taken) =>
    new LoyaltyError(HttpStatus.CONFLICT, 'AWARD_BELOW_TAKEN', `Can’t go below the ${taken} award seats already redeemed.`),
}

const REDEEM_REFUSAL: Record<Exclude<RedeemRefusal, 'no_seat_passengers'>, (flightNumber: string) => LoyaltyError> = {
  past_cutoff: (f) => new LoyaltyError(HttpStatus.CONFLICT, 'AWARD_CLOSED', `Miles bookings on ${f} are closed.`),
  not_enough_seats: (f) => new LoyaltyError(HttpStatus.CONFLICT, 'AWARD_SEATS_UNAVAILABLE', `Not enough award seats left on ${f}.`),
  not_enough_miles: () => new LoyaltyError(HttpStatus.CONFLICT, 'INSUFFICIENT_MILES', 'Not enough miles for this booking.'),
}

const notEnoughUnsold = () =>
  new LoyaltyError(HttpStatus.CONFLICT, 'AWARD_SEATS_UNAVAILABLE', 'The cabin does not have that many unsold seats.')

/**
 * Award seats: the staff release, and the in-process methods features 3a and 3b call. Seats are counted only in
 * feature 3's `seat_inventory` (`award_limit`, `award_held_count`, `award_sold_count`); `loyalty_award_release` holds
 * the miles price. The redeem row in the ledger is the redemption, so there is no redemption table or status here.
 */
@Injectable()
export class LoyaltyAwardService {
  private readonly logger = new Logger(LoyaltyAwardService.name)

  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly audit: AuditService,
    private readonly clock: SimulationClock,
    @Inject(AWARD_SEAT_PORT) private readonly seats: AwardSeatPort,
  ) {}

  // --- Staff: Award Release ----------------------------------------------------------------------------------

  /** Flights departing between `from` and `to` that have seat inventory, earliest first. */
  async listFlights(from?: Date, to?: Date): Promise<AwardFlightDto[]> {
    const now = this.clock.now()
    const [rows, settings] = await Promise.all([
      this.db.flight.findMany({
        where: { dep_at: { gte: from ?? addDays(now, -1), lte: to ?? addDays(now, 90) }, seat_inventory: { some: {} } },
        orderBy: [{ dep_at: 'asc' }, { flight_number: 'asc' }],
        take: FLIGHT_LIST_LIMIT,
        select: FLIGHT_SELECT,
      }),
      this.data.settings(),
    ])
    return rows.map((f) => this.toFlight(f, now, settings.awardCutoffHours))
  }

  /** `POST /staff/loyalty/awards`: the first release on a cabin. */
  release(staff: LoyaltyStaffPrincipal, flightId: string, cabin: string, seats: number, milesCost: number): Promise<AwardFlightDto> {
    return this.save(staff, flightId, cabin, { seats, milesCost }, 'create')
  }

  /** `PUT /staff/loyalty/awards/:flightId/:cabin`: change the seats set aside or the miles price. */
  updateRelease(
    staff: LoyaltyStaffPrincipal,
    flightId: string,
    cabin: string,
    change: { seats?: number; milesCost?: number },
  ): Promise<AwardFlightDto> {
    return this.save(staff, flightId, cabin, change, 'update')
  }

  /**
   * Writes the miles price and sets `award_limit` in one transaction, under the cabin's row lock, with an audit entry.
   * The seats never go below the award seats already held or sold, and the oversell trigger refuses more than the
   * unsold seats. A new price applies to future redemptions only: redeem rows keep the miles they were held at.
   */
  private async save(
    staff: LoyaltyStaffPrincipal,
    flightId: string,
    cabin: string,
    change: { seats?: number; milesCost?: number },
    mode: 'create' | 'update',
  ): Promise<AwardFlightDto> {
    const now = this.clock.now()
    const settings = await this.data.settings()
    try {
      await this.db.$transaction(async (tx) => {
        const flight = await tx.flight.findUnique({ where: { id: flightId }, select: { flight_number: true, dep_at: true, status: true } })
        if (!flight) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'FLIGHT_NOT_FOUND', 'No flight with that id.')
        const inv = await this.seats.lock(tx, flightId, cabin)
        if (!inv) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'AWARD_CABIN_NOT_FOUND', 'This aircraft has no such cabin.')
        const existing = await tx.loyalty_award_release.findUnique({
          where: { flight_id_cabin: { flight_id: flightId, cabin } },
          select: { miles_cost: true },
        })
        if (mode === 'create' && existing) {
          throw new LoyaltyError(
            HttpStatus.CONFLICT,
            'AWARD_ALREADY_RELEASED',
            'Seats are already released on this cabin; edit the release.',
          )
        }
        if (mode === 'update' && !existing) {
          throw new LoyaltyError(HttpStatus.NOT_FOUND, 'AWARD_NOT_RELEASED', 'No award seats are released on this cabin yet.')
        }

        const seats = change.seats ?? inv.awardLimit
        const milesCost = change.milesCost ?? existing?.miles_cost ?? 0
        const taken = inv.awardHeld + inv.awardSold
        const refusal = checkRelease({
          flightStatus: flight.status,
          depAt: flight.dep_at,
          now,
          cutoffHours: settings.awardCutoffHours,
          seats,
          milesCost,
          seatsTaken: taken,
        })
        if (refusal) throw RELEASE_REFUSAL[refusal](taken, settings.awardCutoffHours)

        await tx.loyalty_award_release.upsert({
          where: { flight_id_cabin: { flight_id: flightId, cabin } },
          create: { flight_id: flightId, cabin, miles_cost: milesCost, released_by_staff_id: staff.staffId },
          update: { miles_cost: milesCost, released_by_staff_id: staff.staffId, updated_at: new Date() },
          select: { flight_id: true },
        })
        await this.seats.setAwardSeats(tx, flightId, cabin, seats)
        await this.audit.write(
          {
            actor: AuditService.staffActor({ id: staff.userId, roleCode: staff.roleCode }),
            sourceFeature: '11',
            action: mode === 'create' ? 'create' : 'update',
            entityType: 'loyalty_award_release',
            entityId: `${flightId}:${cabin}`,
            summary: `${mode === 'create' ? 'Released' : 'Changed release to'} ${seats} ${cabin} award seat${seats === 1 ? '' : 's'} at ${milesCost} miles on ${flight.flight_number}`,
            before: existing ? { award_limit: inv.awardLimit, miles_cost: existing.miles_cost } : null,
            after: { award_limit: seats, miles_cost: milesCost },
            occurredAt: now,
          },
          tx,
        )
      })
    } catch (error) {
      if (!(error instanceof LoyaltyError) && isCheckViolation(error)) throw notEnoughUnsold()
      throw error
    }
    return this.flight(flightId)
  }

  private async flight(flightId: string): Promise<AwardFlightDto> {
    const [row, settings] = await Promise.all([
      this.db.flight.findUnique({ where: { id: flightId }, select: FLIGHT_SELECT }),
      this.data.settings(),
    ])
    if (!row) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'FLIGHT_NOT_FOUND', 'No flight with that id.')
    return this.toFlight(row, this.clock.now(), settings.awardCutoffHours)
  }

  private toFlight(f: FlightRow, now: Date, cutoffHours: number): AwardFlightDto {
    const inventory = [...f.seat_inventory].sort((a, b) => CABINS.indexOf(a.cabin as never) - CABINS.indexOf(b.cabin as never))
    const releases: AwardFlightDto['releases'] = {}
    for (const s of inventory) {
      if (!s.loyalty_award_release) continue
      releases[s.cabin] = {
        released: s.award_limit,
        redeemed: s.award_held_count + s.award_sold_count,
        milesCost: s.loyalty_award_release.miles_cost,
      }
    }
    const type = f.aircraft.aircraft_type
    return {
      flightId: f.id,
      flightNumber: f.flight_number,
      route: `${f.route.origin} → ${f.route.destination}`,
      departsAt: f.dep_at.toISOString(),
      status: awardFlightStatus(f.status),
      aircraft: { name: type.model || type.code, cabins: inventory.filter((s) => s.capacity > 0).map((s) => s.cabin) },
      releases,
      returnedToCash: isOpenFlight(f.status) && now >= addHours(f.dep_at, -cutoffHours),
    }
  }

  // --- Feature 3a: search ------------------------------------------------------------------------------------

  /**
   * Per flight and cabin with released award seats: the miles price, award seats left and whether the party fits, plus
   * the customer's balance when given. Read-only, one query for all flights. Search must never break on loyalty, so a
   * failure is logged and answered with no offers.
   */
  async awardAvailability(flights: AwardFlightRequest[], party: AwardParty, customerId?: string | null): Promise<AwardAvailabilityDto[]> {
    if (flights.length === 0) return []
    try {
      const now = this.clock.now()
      const wanted = new Map<string, Set<string> | null>()
      for (const f of flights) {
        const cabins = wanted.get(f.flightId)
        if (!f.cabin || cabins === null) wanted.set(f.flightId, null)
        else wanted.set(f.flightId, (cabins ?? new Set()).add(f.cabin))
      }
      const [releases, settings, member] = await Promise.all([
        this.db.loyalty_award_release.findMany({
          where: { flight_id: { in: [...wanted.keys()] } },
          select: {
            flight_id: true,
            cabin: true,
            miles_cost: true,
            seat_inventory: {
              select: {
                award_limit: true,
                award_held_count: true,
                award_sold_count: true,
                flight: { select: { dep_at: true, status: true } },
              },
            },
          },
        }),
        this.data.settings(),
        customerId ? this.db.loyalty_member.findUnique({ where: { customer_id: customerId }, select: { miles_balance: true } }) : null,
      ])
      const balance = member?.miles_balance ?? null
      return releases
        .filter((r) => {
          const cabins = wanted.get(r.flight_id)
          return cabins === null || cabins?.has(r.cabin)
        })
        .map((r) => {
          const inv = r.seat_inventory
          const offer = awardOffer({
            milesCost: r.miles_cost,
            seats: { awardLimit: inv.award_limit, awardHeld: inv.award_held_count, awardSold: inv.award_sold_count },
            party,
            flightStatus: inv.flight.status,
            depAt: inv.flight.dep_at,
            now,
            cutoffHours: settings.awardCutoffHours,
          })
          return {
            flightId: r.flight_id,
            cabin: r.cabin,
            ...offer,
            balance,
            balanceCovers: balance === null ? null : balance >= offer.milesTotal,
          }
        })
    } catch (error) {
      this.logger.warn(`awardAvailability failed; search shows no miles offers: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  // --- Feature 3b: redeem and reverse ------------------------------------------------------------------------

  /**
   * Writes one `redeem` row per award coupon of a miles booking, inside feature 3b's hold transaction `tx`, for that
   * cabin's `miles_cost`. A lap infant takes no seat and has no row. Refuses with 409 (and writes nothing) when the
   * member has not joined, a flight is past the cutoff or not for sale, a cabin has no release or too few award seats,
   * or the balance is short. Safe to repeat: coupons that already have a redeem row are skipped.
   *
   * Call it after `InventoryPort.lock` and either before 3b raises `award_held_count` (the default: the seats are checked
   * here) or after, with `seatsAlreadyHeld: true` (the seats were then checked by seat_inventory's own CHECK). The
   * balance is checked here and again by `miles_balance >= 0` under the member's row lock, so two bookings by one member
   * queue and the second is refused if the balance is short.
   */
  async redeem(tx: Tx, bookingId: string, opts: { seatsAlreadyHeld?: boolean } = {}): Promise<RedeemResultDto> {
    const now = this.clock.now()
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { customer_id: true, payment_type: true } })
    if (!booking) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'No booking with that id.')
    if (booking.payment_type !== 'miles') {
      throw new LoyaltyError(HttpStatus.CONFLICT, 'NOT_A_MILES_BOOKING', 'This booking is not paid with miles.')
    }
    const member = await tx.loyalty_member.findUnique({
      where: { customer_id: booking.customer_id },
      select: { id: true, miles_balance: true },
    })
    if (!member) throw new LoyaltyError(HttpStatus.CONFLICT, 'NOT_A_MEMBER', 'The customer has not joined Flython Miles.')

    // Award coupons are the live coupons with no fare class (an award seat is not sold under a feature 4 fare class).
    const coupons = await tx.booking_coupon.findMany({
      where: { booking_id: bookingId, status: { in: ['held', 'confirmed'] }, booking_segment: { fare_class_id: null } },
      select: {
        id: true,
        flight_id: true,
        booking_segment: { select: { cabin: true } },
        booking_passenger: { select: { lap_of_id: true } },
      },
    })
    const done = await tx.loyalty_transaction.findMany({
      where: { type: 'redeem', booking_coupon_id: { in: coupons.map((c) => c.id) } },
      select: { booking_coupon_id: true },
    })
    const redeemed = new Set(done.map((d) => d.booking_coupon_id))
    const pending = coupons.filter((c) => !redeemed.has(c.id))

    // One group per flight and cabin, locked in a fixed order so two bookings never deadlock on each other's cabins.
    const groups = new Map<string, typeof pending>()
    for (const c of pending) {
      const key = `${c.flight_id}|${c.booking_segment.cabin}`
      groups.set(key, [...(groups.get(key) ?? []), c])
    }
    const settings = await this.data.settings(tx)
    const flights = await tx.flight.findMany({
      where: { id: { in: [...new Set(pending.map((c) => c.flight_id))] } },
      select: { id: true, flight_number: true, dep_at: true, status: true },
    })
    const flightById = new Map(flights.map((f) => [f.id, f]))

    let remaining = member.miles_balance
    const rows: { bookingCouponId: string; miles: number }[] = []
    for (const key of [...groups.keys()].sort()) {
      const group = groups.get(key) ?? []
      const [flightId, cabin] = key.split('|')
      const flight = flightById.get(flightId)
      if (!flight || !isOpenFlight(flight.status)) throw REDEEM_REFUSAL.past_cutoff(flight?.flight_number ?? 'this flight')
      const release = await tx.loyalty_award_release.findUnique({
        where: { flight_id_cabin: { flight_id: flightId, cabin } },
        select: { miles_cost: true },
      })
      if (!release) {
        throw new LoyaltyError(
          HttpStatus.CONFLICT,
          'AWARD_NOT_RELEASED',
          `No award seats are released in ${cabin} on ${flight.flight_number}.`,
        )
      }
      const inv = await this.seats.lock(tx, flightId, cabin)
      if (!inv) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'AWARD_CABIN_NOT_FOUND', 'This flight has no such cabin.')
      const seated = group.filter((c) => c.booking_passenger.lap_of_id === null).length
      const result = draftRedemption({
        passengers: group.map((c) => ({ bookingCouponId: c.id, isLapInfant: c.booking_passenger.lap_of_id !== null })),
        milesCost: release.miles_cost,
        // With the seats already held, they are counted in award_held_count: give them back for this check.
        seats: opts.seatsAlreadyHeld ? { ...inv, awardHeld: Math.max(0, inv.awardHeld - seated) } : inv,
        balance: remaining,
        depAt: flight.dep_at,
        now,
        cutoffHours: settings.awardCutoffHours,
      })
      if ('refusal' in result) {
        if (result.refusal === 'no_seat_passengers') continue
        throw REDEEM_REFUSAL[result.refusal](flight.flight_number)
      }
      remaining -= result.totalMiles
      rows.push(...result.rows)
    }

    if (rows.length > 0) {
      try {
        await tx.loyalty_transaction.createMany({
          data: rows.map((r) => ({
            member_id: member.id,
            type: 'redeem',
            miles: r.miles,
            booking_coupon_id: r.bookingCouponId,
            occurred_at: now,
          })),
          skipDuplicates: true, // a concurrent repeat already wrote it
        })
      } catch (error) {
        if (isCheckViolation(error)) throw REDEEM_REFUSAL.not_enough_miles('')
        throw error
      }
    }
    return {
      memberId: member.id,
      milesSpent: rows.reduce((sum, r) => sum - r.miles, 0),
      redeemed: rows,
      alreadyRedeemed: redeemed.size,
    }
  }

  /**
   * Gives back the miles of award coupons feature 3b has expired or cancelled (a lapsed hold, a cancellation by the
   * customer or staff, or a cancelled flight), inside 3b's transaction `tx`, after it has set the coupons' status. One
   * `redeem_reversal` per redeem row, at most once and for the same member (UNIQUE (reversed_transaction_id, member_id)),
   * so a repeat writes nothing. A coupon still held or confirmed is skipped, so a live seat never gets its miles back.
   *
   * After the cutoff the freed award seat stays in `award_limit` until the hourly return-to-cash job lowers it.
   */
  async reverseRedemption(tx: Tx, couponIds: readonly string[]): Promise<ReversalResultDto> {
    const ids = [...new Set(couponIds)]
    if (ids.length === 0) return { reversed: 0, milesReturned: 0, skippedCouponIds: [] }
    const now = this.clock.now()

    const redeems = await tx.loyalty_transaction.findMany({
      where: { type: 'redeem', booking_coupon_id: { in: ids } },
      select: {
        id: true,
        member_id: true,
        miles: true,
        occurred_at: true,
        booking_coupon_id: true,
        booking_coupon: { select: { status: true } },
      },
    })
    const closed = redeems.filter((r) => r.booking_coupon && ['cancelled', 'expired'].includes(r.booking_coupon.status))
    const reversals = await tx.loyalty_transaction.findMany({
      where: { type: 'redeem_reversal', reversed_transaction_id: { in: closed.map((r) => r.id) } },
      select: { id: true, member_id: true, miles: true, occurred_at: true, reversed_transaction_id: true },
    })

    const ledger: LedgerRow[] = [
      ...closed.map((r) => ({ ...base(r), type: 'redeem' as const, reversedTransactionId: null })),
      ...reversals.map((r) => ({ ...base(r), type: 'redeem_reversal' as const, reversedTransactionId: r.reversed_transaction_id })),
    ]
    const memberOf = new Map(closed.map((r) => [r.id, r.member_id]))
    const drafts = draftReversals(
      ledger,
      closed.map((r) => r.id),
    )
    let reversed = 0
    if (drafts.length > 0) {
      const result = await tx.loyalty_transaction.createMany({
        data: drafts.map((d) => ({
          member_id: memberOf.get(d.reversedTransactionId) as string,
          type: 'redeem_reversal',
          miles: d.miles,
          reversed_transaction_id: d.reversedTransactionId,
          occurred_at: now,
        })),
        skipDuplicates: true,
      })
      reversed = result.count
    }
    const closedCoupons = new Set(closed.map((r) => r.booking_coupon_id))
    return {
      reversed,
      milesReturned: reversed === drafts.length ? drafts.reduce((sum, d) => sum + d.miles, 0) : 0,
      skippedCouponIds: ids.filter((id) => !closedCoupons.has(id)),
    }
  }

  // --- Job: return to cash -----------------------------------------------------------------------------------

  /**
   * For every cabin of a flight departing within `award_cutoff_hours` that still has unredeemed award seats, lowers
   * `award_limit` to the award seats held or sold, so those seats sell for cash at once. One short transaction per
   * cabin under its row lock; a cabin with nothing to return is left alone, so a repeat changes nothing.
   */
  async returnToCash(now: Date): Promise<Record<string, number>> {
    const settings = await this.data.settings()
    const until = addHours(now, settings.awardCutoffHours)
    let cabins = 0
    let seatsReturned = 0
    const seen = new Set<string>()

    for (;;) {
      const batch = await this.db.$queryRaw<{ flight_id: string; cabin: string }[]>`
        SELECT si.flight_id, si.cabin
          FROM seat_inventory si
          JOIN flight f ON f.id = si.flight_id
         WHERE si.award_limit > si.award_held_count + si.award_sold_count
           AND f.dep_at <= ${until}
         ORDER BY f.dep_at, si.flight_id, si.cabin
         LIMIT ${RETURN_BATCH}`
      const fresh = batch.filter((b) => !seen.has(`${b.flight_id}|${b.cabin}`))
      if (fresh.length === 0) break

      for (const { flight_id: flightId, cabin } of fresh) {
        seen.add(`${flightId}|${cabin}`)
        const returned = await this.db.$transaction(async (tx) => {
          const inv = await this.seats.lock(tx, flightId, cabin)
          if (!inv) return 0
          const target = awardLimitOnReturnToCash(inv)
          if (inv.awardLimit <= target) return 0
          await this.seats.setAwardSeats(tx, flightId, cabin, target)
          return inv.awardLimit - target
        })
        if (returned > 0) {
          cabins += 1
          seatsReturned += returned
        }
      }
      if (batch.length < RETURN_BATCH) break
    }
    return { cabins, seatsReturned }
  }
}

const base = (r: { id: string; miles: number; occurred_at: Date }) => ({
  id: r.id,
  miles: r.miles,
  occurredAt: r.occurred_at,
  expiresAt: null,
  expiredTransactionId: null,
})
