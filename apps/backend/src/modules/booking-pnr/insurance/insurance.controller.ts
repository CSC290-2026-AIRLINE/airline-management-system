import { Controller, Get, Param } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import type { InsuranceOffer } from '../contracts'
import { BookingInsuranceService } from './insurance.service'

@Controller('bookings')
export class BookingInsuranceController {
  constructor(private readonly insurance: BookingInsuranceService) {}

  /** What the booker's loyalty tier offers: included, an add-on at the member price, or nothing. */
  @Get(':ref/insurance')
  offer(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<InsuranceOffer> {
    return this.insurance.offerForUser(ref, user.id)
  }
}
