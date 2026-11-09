import { Body, Controller, Headers, Post, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BookingError } from '../common/booking-error'
import { HoldBookingDto, type HoldBookingResponse } from './dto/hold-booking.dto'
import { HoldService } from './hold.service'

@Controller('bookings')
export class HoldController {
  constructor(private readonly holds: HoldService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid booking request', 422),
      }),
    )
    request: HoldBookingDto,
  ): Promise<HoldBookingResponse> {
    return this.holds.createForUser(user.id, key, request)
  }
}
