import { StaffBookingLookupService } from './staff-booking-lookup.service'
import { StaffBookingQueryDto } from './staff-booking-query.dto'
import { Body, Controller, Headers, Post, Get, Query, Param, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BookingError } from '../common/booking-error'
import type { HoldBookingResponse } from '../hold/dto/hold-booking.dto'
import { HoldService } from '../hold/hold.service'
import { StaffHoldBookingDto } from './staff-hold-booking.dto'

@Controller('staff/bookings')
export class StaffBookingController {
  constructor(
    private readonly holds: HoldService,
    private readonly lookups: StaffBookingLookupService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid booking lookup criteria', 400),
      }),
    )
    query: StaffBookingQueryDto,
  ) {
    return this.lookups.list(user.id, query)
  }

  @Get(':ref')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('ref') reference: string) {
    return this.lookups.detail(user.id, reference)
  }
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid staff booking request', 422),
      }),
    )
    request: StaffHoldBookingDto,
  ): Promise<HoldBookingResponse> {
    return this.holds.createForStaff(user.id, request.customerId, key, request)
  }
}
