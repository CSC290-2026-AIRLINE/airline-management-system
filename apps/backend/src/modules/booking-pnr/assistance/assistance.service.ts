import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { BookingError } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  SEAT_MAP_PORT,
  type BookingClock,
  type BookingTransaction,
  type SeatMapPort,
  type ServiceRequestInput,
  type ServiceRequestPort,
} from '../contracts'

const CODES = new Set(['WCHR', 'WCHS', 'WCHC', 'UMNR', 'MEDA'])

function ageOn(birth: Date, date: Date): number {
  let age = date.getUTCFullYear() - birth.getUTCFullYear()
  if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate()))
    age--
  return age
}

@Injectable()
export class AssistanceService implements ServiceRequestPort {
  constructor(
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(SEAT_MAP_PORT) private readonly seatMaps: SeatMapPort,
  ) {}

  // The caller must authorize the staff member and publish service_request.updated after its transaction commits.
  async reviewRequest(
    tx: BookingTransaction,
    requestId: string,
    staffId: string,
    next: 'accepted' | 'rejected' | 'completed',
    decisionNote?: string,
  ) {
    if (!['accepted', 'rejected', 'completed'].includes(next)) throw new BadRequestException('Invalid assistance status')
    const note = decisionNote?.trim()
    if (next === 'rejected' && !note) throw new BadRequestException('A rejection reason is required')
    const current = await tx.booking_service_request.findUnique({ where: { id: requestId }, select: { id: true, status: true } })
    if (!current) throw new NotFoundException('Assistance request not found')
    const expected = next === 'completed' ? 'accepted' : 'requested'
    if (current.status !== expected) throw new ConflictException('This request cannot move to that status')
    const now = this.clock.now()
    const result = await tx.booking_service_request.updateMany({
      where: { id: requestId, status: expected },
      data: {
        status: next,
        decision_note: next === 'rejected' ? note : null,
        handled_by_staff_id: staffId,
        handled_at: now,
        updated_at: now,
      },
    })
    if (result.count !== 1) throw new ConflictException('This request was changed by someone else')
    return { requestId, status: next, handledByStaffId: staffId, handledAt: now }
  }

  async createForHold(tx: BookingTransaction, requests: ServiceRequestInput[]): Promise<void> {
    const now = this.clock.now()
    for (const request of requests) {
      if (!CODES.has(request.serviceCode)) throw new BadRequestException('Unsupported assistance code')
      if (['UMNR', 'MEDA'].includes(request.serviceCode) && !request.note?.trim()) {
        throw new BadRequestException('A note is required for this assistance request')
      }
      // Serialize overlapping booking-wide and segment-specific requests, including NULL segment IDs.
      await tx.$queryRaw`SELECT id FROM booking WHERE id = ${request.bookingId}::uuid FOR UPDATE`
      const passenger = await tx.booking_passenger.findFirst({
        where: { id: request.bookingPassengerId, booking_id: request.bookingId },
        select: { passenger: { select: { date_of_birth: true } } },
      })
      if (!passenger) throw new BadRequestException('Passenger does not belong to this booking')
      const segments = await tx.booking_segment.findMany({
        where: { booking_id: request.bookingId, ...(request.bookingSegmentId ? { id: request.bookingSegmentId } : {}) },
        select: { id: true, flight_id: true },
      })
      if (!segments.length) throw new BadRequestException('No matching booking segment')
      const existing = await tx.booking_service_request.findFirst({
        where: {
          booking_passenger_id: request.bookingPassengerId,
          service_code: request.serviceCode,
          status: { in: ['requested', 'accepted'] },
          OR: [{ booking_segment_id: null }, { booking_segment_id: { in: segments.map((segment) => segment.id) } }],
        },
        select: { id: true },
      })
      if (existing) throw new BadRequestException('An active assistance request already exists')
      const flights = await tx.flight.findMany({
        where: { id: { in: segments.map((segment) => segment.flight_id) } },
        select: { id: true, dep_at: true, service_date: true },
      })
      if (flights.length !== segments.length) throw new BadRequestException('Flight not found')
      const minimumHours = ['UMNR', 'MEDA'].includes(request.serviceCode) ? 48 : 24
      if (flights.some((flight) => flight.dep_at.getTime() - now.getTime() < minimumHours * 60 * 60 * 1000)) {
        throw new BookingError('ASSISTANCE_TOO_LATE', 'Not enough time remains before departure')
      }
      if (request.serviceCode === 'UMNR') {
        const birth = passenger.passenger.date_of_birth
        if (
          !birth ||
          flights.some((flight) => {
            const age = ageOn(birth, flight.service_date)
            return age < 5 || age > 11
          })
        ) {
          throw new BadRequestException('Unaccompanied minors must be aged 5–11 on departure')
        }
      }
      const seats = await tx.seat_assignment.findMany({
        where: {
          status: { in: ['held', 'assigned'] },
          booking_coupon: {
            booking_passenger_id: request.bookingPassengerId,
            booking_segment_id: { in: segments.map((segment) => segment.id) },
          },
        },
        select: { flight_id: true, seat_code: true },
      })
      for (const seat of seats) {
        const map = await this.seatMaps.getSeatMap(seat.flight_id)
        if (map.rows.some((row) => row.seats.some((item) => item.seatCode === seat.seat_code && item.type === 'exit'))) {
          throw new BookingError('SEAT_NOT_ALLOWED', 'Passengers requesting assistance cannot sit in an exit row')
        }
      }
      try {
        await tx.booking_service_request.create({
          data: {
            booking_id: request.bookingId,
            booking_passenger_id: request.bookingPassengerId,
            booking_segment_id: request.bookingSegmentId ?? null,
            service_code: request.serviceCode,
            note: request.note?.trim() || null,
            status: 'requested',
            requested_at: now,
            updated_at: now,
          },
        })
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
          throw new BadRequestException('An active assistance request already exists')
        throw error
      }
    }
  }
}
