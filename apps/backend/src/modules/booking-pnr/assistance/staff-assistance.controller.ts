import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, ValidationPipe } from '@nestjs/common'
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BookingError } from '../common/booking-error'
import { StaffAssistanceService } from './staff-assistance.service'

class AssistanceQueryDto {
  @IsOptional()
  @IsIn(['requested', 'accepted', 'rejected', 'completed'])
  status?: 'requested' | 'accepted' | 'rejected' | 'completed'

  @IsOptional()
  @IsUUID()
  flightId?: string
}

class AssistanceReviewDto {
  @IsIn(['accepted', 'rejected', 'completed'])
  status!: 'accepted' | 'rejected' | 'completed'

  @IsOptional()
  @IsString()
  decisionNote?: string
}

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid assistance request', 422),
})

@Controller('staff/service-requests')
export class StaffAssistanceController {
  constructor(private readonly assistance: StaffAssistanceService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(validation) filters: AssistanceQueryDto) {
    return this.assistance.list(user.id, filters)
  }

  @Put(':id')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid request ID', 422) }))
    id: string,
    @Body(validation) input: AssistanceReviewDto,
  ) {
    return this.assistance.review(user.id, id, input.status, input.decisionNote)
  }
}
