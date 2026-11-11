import { Body, Controller, NotFoundException, Param, ParseUUIDPipe, Post, ValidationPipe } from '@nestjs/common'
import { IsString, MaxLength, ValidateIf } from 'class-validator'
import { ConfigService } from '@nestjs/config'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { SeatPaymentService } from './seat-payment.service'
import { BookingError } from '../common/booking-error'

class SeatPaymentDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  overrideReason?: string
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BookingError('SEAT_NOT_ALLOWED', 'Invalid seat payment identifier', 422) })

@Controller('dev/bookings')
export class DevSeatPaymentController {
  constructor(
    private readonly payments: SeatPaymentService,
    private readonly config: ConfigService,
  ) {}
  @Post(':ref/coupons/:couponId/seat/:lockId/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ref') reference: string,
    @Param('couponId', uuid) couponId: string,
    @Param('lockId', uuid) lockId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('SEAT_NOT_ALLOWED', 'Invalid seat payment request', 422),
      }),
    )
    input: SeatPaymentDto = {},
  ) {
    if (this.config.get<string>('NODE_ENV') === 'production') throw new NotFoundException()
    if (input.overrideReason !== undefined) return this.payments.confirmForUser(reference, couponId, lockId, user.id, input.overrideReason)
    return this.payments.confirmForUser(reference, couponId, lockId, user.id)
  }
}
