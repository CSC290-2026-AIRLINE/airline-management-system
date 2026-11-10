import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@backend/db/generated/prisma/client'
import { isUniqueConstraintError, newBookingReference } from '../common/booking-reference'
import { nextTicketNumber } from '../common/ticket-number'
import type { BookingStatus, PassengerType } from '../contracts'

export interface CreateTestBookingPassenger {
  passengerId: string
  passengerType?: Exclude<PassengerType, 'infant'>
}

export interface CreateTestBookingSegment {
  flightId: string
  cabin: string
  fareClassId?: string | null
  segmentOrder?: number
}

export interface CreateTestBookingSeat {
  passengerId: string
  flightId: string
  seatCode: string
}

export interface CreateTestBookingOptions {
  customerId: string
  passengers: CreateTestBookingPassenger[]
  segments: CreateTestBookingSegment[]
  seats?: CreateTestBookingSeat[]
  status?: Extract<BookingStatus, 'held' | 'confirmed'>
  contactEmail?: string
  contactPhone?: string | null
  bookedAt?: Date
  holdMinutes?: number
  bookedByStaffId?: string | null
  airlineNumber?: string
}

export interface CreatedTestBooking {
  bookingId: string
  reference: string
  couponIdsByPassenger: Record<string, string[]>
}

const DEFAULT_CONTACT_EMAIL = 'feature3@example.com'
const DEFAULT_AIRLINE_NUMBER = '999'
const DEFAULT_PRICE = 148.5

function assertOptions(options: CreateTestBookingOptions): void {
  if (options.passengers.length === 0) {
    throw new Error('createTestBooking needs at least one passenger')
  }
  if (options.segments.length === 0) {
    throw new Error('createTestBooking needs at least one segment')
  }
}

export async function createTestBooking(db: PrismaClient, options: CreateTestBookingOptions): Promise<CreatedTestBooking> {
  assertOptions(options)

  const status = options.status ?? 'held'
  const bookedAt = options.bookedAt ?? new Date()
  const holdExpiresAt = new Date(bookedAt.getTime() + (options.holdMinutes ?? 15) * 60_000)
  const confirmedAt = status === 'confirmed' ? bookedAt : null
  const airlineNumber = options.airlineNumber ?? DEFAULT_AIRLINE_NUMBER

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            booking_reference: newBookingReference(),
            customer_id: options.customerId,
            booked_by_staff_id: options.bookedByStaffId ?? null,
            trip_type: 'one_way',
            status,
            payment_type: 'cash',
            currency: 'USD',
            contact_email: options.contactEmail ?? DEFAULT_CONTACT_EMAIL,
            contact_phone: options.contactPhone ?? null,
            idempotency_key: `test-${randomUUID()}`,
            booked_at: bookedAt,
            hold_expires_at: holdExpiresAt,
            confirmed_at: confirmedAt,
            updated_at: bookedAt,
          },
        })

        const bookingPassengers: Array<{ id: string; passengerId: string }> = []
        for (const passenger of options.passengers) {
          const row = await tx.booking_passenger.create({
            data: {
              booking_id: booking.id,
              passenger_id: passenger.passengerId,
              passenger_type: passenger.passengerType ?? 'adult',
            },
          })
          bookingPassengers.push({ id: row.id, passengerId: row.passenger_id })
        }

        const segments: Array<{ id: string; flightId: string }> = []
        for (const [index, segment] of options.segments.entries()) {
          const row = await tx.booking_segment.create({
            data: {
              booking_id: booking.id,
              flight_id: segment.flightId,
              segment_order: segment.segmentOrder ?? index + 1,
              cabin: segment.cabin,
              fare_class_id: segment.fareClassId ?? null,
            },
          })
          segments.push({ id: row.id, flightId: row.flight_id })
        }

        const couponIdsByPassenger: Record<string, string[]> = {}
        const couponByPassengerAndFlight = new Map<string, string>()

        for (const passenger of bookingPassengers) {
          couponIdsByPassenger[passenger.passengerId] = []
          for (const segment of segments) {
            const coupon = await tx.booking_coupon.create({
              data: {
                booking_id: booking.id,
                booking_segment_id: segment.id,
                booking_passenger_id: passenger.id,
                flight_id: segment.flightId,
                passenger_id: passenger.passengerId,
                price_total: DEFAULT_PRICE,
                status,
                ticket_number: status === 'confirmed' ? await nextTicketNumber(tx, airlineNumber) : null,
              },
            })
            couponIdsByPassenger[passenger.passengerId].push(coupon.id)
            couponByPassengerAndFlight.set(`${passenger.passengerId}:${segment.flightId}`, coupon.id)
          }
        }

        for (const seat of options.seats ?? []) {
          const bookingCouponId = couponByPassengerAndFlight.get(`${seat.passengerId}:${seat.flightId}`)
          if (!bookingCouponId) {
            throw new Error(`No coupon for passenger ${seat.passengerId} on flight ${seat.flightId}`)
          }
          await tx.seat_assignment.create({
            data: {
              booking_coupon_id: bookingCouponId,
              flight_id: seat.flightId,
              seat_code: seat.seatCode,
              status: status === 'confirmed' ? 'assigned' : 'held',
              hold_expires_at: status === 'held' ? holdExpiresAt : null,
              assigned_at: status === 'confirmed' ? bookedAt : null,
              fee_amount: 0,
            },
          })
        }

        return { bookingId: booking.id, reference: booking.booking_reference, couponIdsByPassenger }
      })
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 9) {
        throw error
      }
    }
  }

  throw new Error('Could not create a test booking with a unique reference')
}
