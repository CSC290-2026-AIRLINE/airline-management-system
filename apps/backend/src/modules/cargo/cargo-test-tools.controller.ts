import { Body, Controller, Logger, Param, ParseUUIDPipe, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { DbService } from '@backend/db/db.service'
import { StaffProfilesGuard } from '@backend/modules/passenger-profiles/staff-profiles.guard'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'
import { CargoBookingService } from './cargo-booking.service'
import { CargoClaimsService } from './cargo-claims.service'
import { CargoEventsService } from './cargo-events.service'

// MOCK: replace with Feature 2 / Feature 9 data
const TEST_AIRCRAFT_TYPE = {
  code: 'T320',
  manufacturer: 'TEST Airbus',
  model: 'A320-TEST',
  layout: { cabins: [{ cabin: 'economy', rows: 30, seats_per_row: 6, total: 180 }] },
  hold_weight_limit_kg: 4000,
  max_takeoff_weight_kg: 78000,
  max_range_km: 6100,
  min_turnaround_minutes: 45,
  operating_cost_per_hour: 3500,
  cost_currency: 'USD',
}

const TEST_TAIL = 'HS-TEST'
const DEP_HOURS_LOCAL = [8, 11, 14, 17]

class CreateTestBookingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number
}

@Controller('staff/cargo/test')
@UseGuards(StaffProfilesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CargoTestToolsController {
  private readonly logger = new Logger('CargoTestTools')

  constructor(
    private readonly db: DbService,
    private readonly bookings: CargoBookingService,
    private readonly claims: CargoClaimsService,
    private readonly events: CargoEventsService,
  ) {}

  @Post('flights')
  async createTestFlights() {
    const aircraftType = await this.ensureAircraftType()
    const aircraft = await this.ensureAircraft(aircraftType.id)
    const routes = await this.db.route.findMany({ where: { is_active: true } })

    if (routes.length === 0) {
      return { error: 'No routes found. Run npm run db:seed first.' }
    }

    const now = simNow()
    const created: string[] = []
    const skipped: string[] = []

    for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
      for (let ri = 0; ri < routes.length; ri++) {
        const route = routes[ri]
        const flightNumber = `FY${(ri + 1) * 100 + 1}`
        const depHourLocal = DEP_HOURS_LOCAL[ri % DEP_HOURS_LOCAL.length]

        const serviceDate = new Date(now)
        serviceDate.setUTCDate(serviceDate.getUTCDate() + dayOffset)
        const serviceDateStr = serviceDate.toISOString().slice(0, 10)

        const existing = await this.db.flight.findUnique({
          where: { flight_number_service_date: { flight_number: flightNumber, service_date: new Date(serviceDateStr + 'T00:00:00Z') } },
        })
        if (existing) {
          skipped.push(`${flightNumber} on ${serviceDateStr}`)
          continue
        }

        const depAt = localToUtc(serviceDateStr, depHourLocal)
        const arrAt = new Date(depAt.getTime() + route.block_time_min * 60_000)

        await this.db.flight.create({
          data: {
            flight_number: flightNumber,
            service_date: new Date(serviceDateStr + 'T00:00:00Z'),
            route_id: route.id,
            scheduled_dep_at: depAt,
            scheduled_arr_at: arrAt,
            dep_at: depAt,
            arr_at: arrAt,
            aircraft_id: aircraft.id,
            status: 'scheduled',
          },
        })
        created.push(`${flightNumber} on ${serviceDateStr} (${route.origin}→${route.destination})`)
      }
    }

    return { created, skipped, aircraftId: aircraft.id, aircraftTypeId: aircraftType.id }
  }

  @Post('bookings')
  async createTestBookings(@Body() dto: CreateTestBookingsDto) {
    const count = dto.count ?? 1
    const customer = await this.db.customer.findFirst({ where: { deleted_at: null } })
    if (!customer) return { error: 'No customer found. Sign in once on the customer app.' }

    const commodityType = await this.db.cargo_commodity_type.findFirst({
      where: { is_active: true, handling_class: { not: 'dangerous' } },
    })
    if (!commodityType) return { error: 'No active non-dangerous commodity type found.' }

    const maxPieceKg = Number(commodityType.max_piece_weight_kg)
    const minKg = Number(commodityType.min_weight_kg)
    const maxKg = Math.min(Number(commodityType.max_weight_kg), 300)

    const created: { ref: string; awb: string | null }[] = []
    const failed: { index: number; reason: string }[] = []

    for (let i = 0; i < count; i++) {
      try {
        const now = simNow()
        const flight = await this.db.flight.findFirst({
          where: {
            status: { in: ['scheduled', 'delayed', 'holding'] },
            dep_at: { gt: new Date(now.getTime() + 4 * 3_600_000) },
          },
          orderBy: { dep_at: 'asc' },
          include: { route: true },
        })
        if (!flight) {
          failed.push({ index: i, reason: 'No eligible flight found. Run POST /api/staff/cargo/test/flights first.' })
          break
        }

        const weight = randomBetween(minKg + 1, maxKg)
        const pieces = Math.max(1, Math.ceil(weight / maxPieceKg))
        const volume = +(weight / 200).toFixed(3)

        const booking = await this.bookings.createHeldBooking(customer.id, {
          routeId: flight.route_id,
          shipDate: flight.service_date.toISOString().slice(0, 10),
          commodityTypeId: commodityType.id,
          goodsDescription: `Test shipment ${i + 1} — ${commodityType.name}`,
          pieces,
          declaredWeightKg: weight,
          declaredVolumeM3: volume,
          shipperName: 'Test Shipper Co.',
          shipperPhone: '+66-2-000-0000',
          consigneeName: 'Test Consignee',
          consigneeAddress: '123 Test Street, Bangkok 10110',
          consigneePhone: '+66-2-000-0001',
        })

        const charge = Number(booking.quoted_charge)
        const now2 = simNow()
        const payment = await this.db.payment.create({
          data: {
            source_feature: 17,
            purchase_ref: booking.booking_ref,
            payer_customer_id: customer.id,
            cargo_booking_id: booking.id,
            idempotency_key: `test-cargo-${booking.booking_ref}`,
            status: 'captured',
            provider: 'fake',
            currency: 'USD',
            amount_total: charge,
            voucher_amount: 0,
            card_amount: charge,
            started_at: now2,
            expires_at: new Date(now2.getTime() + 3_600_000),
            authorised_at: now2,
            captured_at: now2,
          },
        })

        const confirmed = await this.bookings.confirmCargoBooking(booking.booking_ref, payment.id, charge)

        created.push({ ref: booking.booking_ref, awb: confirmed.awbNumber })
        this.logger.log(`TEST: created booking ${booking.booking_ref} → AWB ${confirmed.awbNumber ?? 'none'}`)
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        this.logger.warn(`TEST: booking ${i + 1} failed — ${reason}`)
        failed.push({ index: i, reason })
      }
    }

    return { created, failed: failed.length > 0 ? failed : undefined }
  }

  @Post('bookings/:id/departed')
  async simulateDeparture(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.db.$transaction(async (tx) => {
      const event = await this.events.appendEvent(tx, {
        bookingId: id,
        eventType: 'departed',
        actorType: 'system',
      })
      return { status: event.status_after }
    })
  }

  @Post('bookings/:id/arrived')
  async simulateArrival(@Param('id', new ParseUUIDPipe()) id: string) {
    const booking = await this.db.cargo_booking.findUnique({
      where: { id },
      select: { route: { select: { destination: true } } },
    })
    if (!booking) return { error: 'Booking not found' }

    return this.db.$transaction(async (tx) => {
      const event = await this.events.appendEvent(tx, {
        bookingId: id,
        eventType: 'arrived',
        actorType: 'system',
        airportCode: booking.route.destination,
      })
      return { status: event.status_after }
    })
  }

  @Post('bookings/:id/claim')
  async fileTestClaim(@Param('id', new ParseUUIDPipe()) id: string) {
    const booking = await this.db.cargo_booking.findUnique({
      where: { id },
      select: { customer_id: true, quoted_charge: true },
    })
    if (!booking) return { error: 'Booking not found' }

    const halfCharge = Math.round((Number(booking.quoted_charge) / 2) * 100) / 100

    try {
      const result = await this.claims.fileClaim(id, booking.customer_id, {
        claim_type: 'damage',
        pieces_affected: 1,
        description: 'Test claim — damage reported during inspection',
        claimed_amount: halfCharge,
      })
      return { claimRef: result.claimRef, claimId: result.id }
    } catch (e) {
      if (e && typeof e === 'object' && 'response' in e) {
        return (e as { response: unknown }).response
      }
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async ensureAircraftType() {
    const existing = await this.db.aircraft_type.findFirst({ where: { code: TEST_AIRCRAFT_TYPE.code, deleted_at: null } })
    if (existing) return existing
    return this.db.aircraft_type.create({ data: TEST_AIRCRAFT_TYPE })
  }

  private async ensureAircraft(typeId: string) {
    const existing = await this.db.aircraft.findFirst({ where: { tail_number: TEST_TAIL, deleted_at: null } })
    if (existing) return existing
    return this.db.aircraft.create({
      data: {
        tail_number: TEST_TAIL,
        aircraft_type_id: typeId,
        entry_into_service_date: new Date('2020-01-15T00:00:00Z'),
        base_airport_code: 'BKK',
      },
    })
  }
}

function localToUtc(dateStr: string, hourLocal: number): Date {
  // All seeded airports are Asia/Bangkok (UTC+7)
  return new Date(`${dateStr}T${String(hourLocal).padStart(2, '0')}:00:00+07:00`)
}

function randomBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10
}
