import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { BookingVerification, VerifiedBookingPassenger } from './common/report.ports'

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

@Injectable()
export class PrismaBookingVerification implements BookingVerification {
  constructor(private readonly db: DbService) {}

  async verifyPassenger(input: {
    bookingReference: string
    surname: string
    passengerId: string
    flightId?: string
  }): Promise<VerifiedBookingPassenger | null> {
    const reference = input.bookingReference?.trim().toUpperCase()
    const surname = input.surname?.trim()
    const passengerId = input.passengerId?.trim()
    const flightId = input.flightId?.trim()

    if (!reference || !surname || !passengerId || !UUID_PATTERN.test(passengerId) || (flightId && !UUID_PATTERN.test(flightId))) {
      return null
    }

    const coupon = await this.db.booking_coupon.findFirst({
      where: {
        status: 'confirmed',
        passenger_id: passengerId,
        ...(flightId ? { flight_id: flightId } : {}),
        booking_passenger: {
          booking: {
            booking_reference: reference,
          },
          passenger: {
            last_name: {
              equals: surname,
              mode: 'insensitive',
            },
            deleted_at: null,
          },
        },
      },
      select: {
        booking_passenger_id: true,
        passenger_id: true,
        flight_id: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    })

    if (!coupon) {
      return null
    }

    return {
      bookingPassengerId: coupon.booking_passenger_id,
      passengerId: coupon.passenger_id,
      flightId: coupon.flight_id,
    }
  }
}
