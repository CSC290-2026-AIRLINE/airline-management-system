import { Body, Controller, Get, NotFoundException, Param, Put, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BookingError } from '../common/booking-error'
import type { BookingDetail } from '../contracts'
import { BookingContactService, type BookingContact } from './booking-contact.service'
import { BookingReadService } from './booking-read.service'
import { UpdateBookingContactDto } from './dto/update-booking-contact.dto'

/** B4: the booking detail page. A customer asking for another customer's booking gets 404. */
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly read: BookingReadService,
    private readonly contact: BookingContactService,
  ) {}

  @Get(':ref')
  async getBooking(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<BookingDetail> {
    const booking = await this.read.getBookingForUser(ref, user.id)
    if (!booking) {
      throw new NotFoundException(`Booking ${ref} was not found.`)
    }
    return booking
  }

  /** The contact details of a booking that is still on hold, so a customer can correct them before paying. */
  @Put(':ref/contact')
  async updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ref') ref: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid contact details', 422),
      }),
    )
    body: UpdateBookingContactDto,
  ): Promise<BookingContact> {
    return this.contact.updateContactForUser(ref, body, user.id)
  }
}
