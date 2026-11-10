import { Body, Controller, Param, Post, ValidationPipe } from '@nestjs/common'
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BookingError } from '../common/booking-error'
import type { ServiceCode } from '../contracts'
import { BookingAssistanceService } from './booking-assistance.service'

class AssistanceRequestDto {
  @IsUUID()
  bookingPassengerId!: string

  @IsOptional()
  @IsUUID()
  bookingSegmentId?: string | null

  @IsIn(['WCHR', 'WCHS', 'WCHC', 'UMNR', 'MEDA'])
  serviceCode!: ServiceCode

  @IsOptional()
  @IsString()
  note?: string | null
}

@Controller('bookings')
export class BookingAssistanceController {
  constructor(private readonly assistance: BookingAssistanceService) {}

  @Post(':ref/service-requests')
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ref') reference: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid assistance request', 422),
      }),
    )
    input: AssistanceRequestDto,
  ) {
    return this.assistance.requestForUser(reference, user.id, input)
  }
}
