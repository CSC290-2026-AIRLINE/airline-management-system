import { Body, Controller, Param, ParseUUIDPipe, Put, ValidationPipe } from '@nestjs/common'
import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BookingError } from '../common/booking-error'
import { SeatChangeService } from './seat-change.service'

class ChangeSeatDto {
  @Matches(/^[1-9][0-9]?[A-Z]$/)
  seatCode!: string

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  overrideReason?: string
}

@Controller('bookings')
export class SeatChangeController {
  constructor(private readonly seatChanges: SeatChangeService) {}

  @Put(':ref/coupons/:id/seat')
  changeSeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ref') reference: string,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid booking coupon', 422) }))
    couponId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('SEAT_NOT_ALLOWED', 'Invalid seat selection', 422),
      }),
    )
    input: ChangeSeatDto,
  ) {
    if (input.overrideReason !== undefined)
      return this.seatChanges.changeSeatForUser(reference, couponId, input.seatCode, user.id, input.overrideReason)
    return this.seatChanges.changeSeatForUser(reference, couponId, input.seatCode, user.id)
  }
}
