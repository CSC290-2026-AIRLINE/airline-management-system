import { Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { DemoBookingCustomerService } from './demo-booking-customer.service'

@Controller('dev/staff/booking-customers')
export class DemoBookingCustomerController {
  constructor(private readonly customers: DemoBookingCustomerService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.customers.list(user.id)
  }
}
