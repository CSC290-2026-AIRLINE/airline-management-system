import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import type { BookingDetail } from '../contracts'
import { BookingReadService } from './booking-read.service'

/** B4: the booking detail page. A customer asking for another customer's booking gets 404. */
@Controller('bookings')
export class BookingsController {
  constructor(private readonly read: BookingReadService) {}

  @Get(':ref')
  async getBooking(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<BookingDetail> {
    const booking = await this.read.getBookingForUser(ref, user.id)
    if (!booking) {
      throw new NotFoundException(`Booking ${ref} was not found.`)
    }
    return booking
  }
}
