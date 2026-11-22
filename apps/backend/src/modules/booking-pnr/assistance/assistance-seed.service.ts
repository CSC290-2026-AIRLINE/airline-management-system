import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BOOKING_CLOCK, type BookingClock, type ServiceCode } from '../contracts'
import { createTestBooking, type CreateTestBookingPassenger } from '../testing/create-test-booking'
import { AssistanceService } from './assistance.service'

const MARKER = 'f03-member-c-assistance-v1'
const samples: Array<{
  firstName: string
  lastName: string
  child?: boolean
  code: ServiceCode
  status: 'requested' | 'accepted' | 'rejected' | 'completed'
  note: string
}> = [
  {
    firstName: 'Somchai',
    lastName: 'Wongchai',
    code: 'WCHC',
    status: 'requested',
    note: 'Folding wheelchair; assistance to the seat requested.',
  },
  {
    firstName: 'Mali',
    lastName: 'Saranpat',
    child: true,
    code: 'WCHR',
    status: 'requested',
    note: 'Travelling with an adult; assistance on the ramp requested.',
  },
  {
    firstName: 'Arun',
    lastName: 'Piyapong',
    code: 'MEDA',
    status: 'rejected',
    note: 'Medical support requested; please review arrangements.',
  },
  {
    firstName: 'Ploy',
    lastName: 'Chaiyo',
    child: true,
    code: 'UMNR',
    status: 'accepted',
    note: 'Guardian: Demo Guardian, +66 2 000 0003. Met at the arrival gate.',
  },
  {
    firstName: 'Nattaya',
    lastName: 'Boon',
    code: 'WCHS',
    status: 'completed',
    note: 'Assistance with steps arranged by the airport team.',
  },
]

@Injectable()
export class AssistanceSeedService {
  constructor(
    private readonly db: DbService,
    private readonly assistance: AssistanceService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  async seed() {
    if (process.env.NODE_ENV === 'production') throw new Error('Assistance seed is for local development only')
    const now = this.clock.now()
    const [customer, staff] = await Promise.all([
      this.db.customer.findFirst({ where: { user: { clerk_user_id: 'f03-seed-customer' }, deleted_at: null }, select: { id: true } }),
      this.db.staff.findFirst({
        where: { deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
    ])
    if (!customer) throw new Error('Run npm run db:seed:f03 -w apps/backend first')
    if (!staff) throw new Error('Run npm run db:seed -w apps/backend or sign in with a provisioned local staff account first')
    let booking = await this.db.booking.findFirst({
      where: { idempotency_key: MARKER, customer_id: customer.id },
      select: { id: true, booking_reference: true },
    })
    if (!booking) {
      const flight = await this.db.flight.findFirst({
        where: {
          flight_number: { startsWith: 'F309' },
          status: 'scheduled',
          dep_at: { gte: new Date(now.getTime() + 49 * 60 * 60 * 1000) },
          seat_inventory: { some: { cabin: 'economy' } },
        },
        orderBy: { dep_at: 'asc' },
        select: { id: true },
      })
      if (!flight) throw new Error('Run npm run db:seed:f03 -w apps/backend to create flights at least 49 hours ahead')
      const passengers: CreateTestBookingPassenger[] = []
      for (const [index, sample] of samples.entries()) {
        const passport = `F03CSEED${index + 1}`
        const birth = new Date(Date.UTC(now.getUTCFullYear() - (sample.child ? 8 : 35), 0, 1))
        let passenger = await this.db.passenger.findFirst({ where: { passport_number: passport }, select: { id: true } })
        passenger ??= await this.db.passenger.create({
          data: {
            first_name: sample.firstName,
            last_name: sample.lastName,
            passport_number: passport,
            date_of_birth: birth,
            gender: 'X',
            nationality: 'th',
          },
          select: { id: true },
        })
        passengers.push({ passengerId: passenger.id, passengerType: sample.child ? ('child' as const) : ('adult' as const) })
      }
      // Recover a fixture if an earlier run stopped before recording its marker.
      booking = await this.db.booking.findFirst({
        where: { customer_id: customer.id, booking_passenger: { some: { passenger_id: passengers[0].passengerId } } },
        select: { id: true, booking_reference: true },
      })
      if (!booking) {
        const fixture = await createTestBooking(this.db, {
          customerId: customer.id,
          passengers,
          segments: [{ flightId: flight.id, cabin: 'economy' }],
          status: 'confirmed',
          bookedAt: now,
        })
        booking = { id: fixture.bookingId, booking_reference: fixture.reference }
      }
      await this.db.booking.update({ where: { id: booking.id }, data: { idempotency_key: MARKER, updated_at: now } })
    }
    const bookingId = booking.id
    const created = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM booking WHERE id = ${bookingId}::uuid FOR UPDATE`
      const passengers = await tx.booking_passenger.findMany({ where: { booking_id: bookingId }, include: { passenger: true } })
      const segment = await tx.booking_segment.findFirstOrThrow({ where: { booking_id: bookingId } })
      let count = 0
      for (const [index, sample] of samples.entries()) {
        const passenger = passengers.find((person) => person.passenger.passport_number === `F03CSEED${index + 1}`)
        if (!passenger) throw new Error('Assistance seed booking is missing its sample passenger')
        const where = {
          booking_id: bookingId,
          booking_passenger_id: passenger.id,
          booking_segment_id: segment.id,
          service_code: sample.code,
        }
        if (await tx.booking_service_request.findFirst({ where })) continue
        await this.assistance.createForHold(tx, [
          {
            bookingId,
            bookingPassengerId: passenger.id,
            bookingSegmentId: segment.id,
            serviceCode: sample.code,
            note: sample.note,
            requestedAt: now,
          },
        ])
        const request = await tx.booking_service_request.findFirstOrThrow({ where })
        if (sample.status !== 'requested') {
          await this.assistance.reviewRequest(
            tx,
            request.id,
            staff.id,
            sample.status === 'completed' ? 'accepted' : sample.status,
            sample.status === 'rejected' ? 'Please contact the airline to arrange suitable medical support.' : undefined,
          )
          if (sample.status === 'completed') await this.assistance.reviewRequest(tx, request.id, staff.id, 'completed')
        }
        count++
      }
      return count
    })
    return { reference: booking.booking_reference, created }
  }
}
