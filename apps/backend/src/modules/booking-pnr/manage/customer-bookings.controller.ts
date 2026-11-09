import { Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BookingReadService } from './booking-read.service'
import type { CustomerTrips } from './booking-read.service'

/** B4: My Trips, split into the Upcoming and Past tabs. */
@Controller('customers/me/bookings')
export class CustomerBookingsController {
  constructor(private readonly read: BookingReadService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CustomerTrips> {
    return this.read.listCustomerTrips(user.id)
  }
}
