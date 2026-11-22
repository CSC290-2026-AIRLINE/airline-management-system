import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import { BOOKING_READ_PORT, type BookingListQuery, type BookingReadPort } from '../contracts'
import type { StaffBookingQueryDto } from './staff-booking-query.dto'

@Injectable()
export class StaffBookingLookupService {
  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_READ_PORT) private readonly read: BookingReadPort,
  ) {}

  private async requireStaff(userId: string): Promise<void> {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
    if (!staff) throw new BookingError('INVALID_BOOKING_STATE', 'An active staff account is required', 403)
  }

  async list(userId: string, input: StaffBookingQueryDto) {
    await this.requireStaff(userId)
    const query: BookingListQuery = { page: input.page ?? 1, pageSize: input.pageSize ?? 20 }
    const search = input.search?.trim()
    if (search) query.search = search
    else {
      if (input.from && input.to && input.from > input.to)
        throw new BookingError('INVALID_BOOKING_STATE', 'Start date must not follow end date', 400)
      query.dateType = input.dateType ?? 'booked'
      if (input.from) query.from = new Date(`${input.from}T00:00:00.000Z`)
      if (input.to) query.to = new Date(`${input.to}T23:59:59.999Z`)
      if (input.status) query.status = input.status
      if (input.flightId) query.flightId = input.flightId
    }
    // B owns matching, newest-first ordering, paging and all booking/profile queries.
    return this.read.listStaffBookings(query)
  }

  async detail(userId: string, reference: string) {
    await this.requireStaff(userId)
    const ref = reference.trim().toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(ref)) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    const booking = await this.read.getBookingDetail(ref, { staff: true })
    if (!booking) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    return booking
  }
}
