import { F7ExceptionFilter } from '@backend/modules/passenger-profiles/f7-exception.filter'
import { UseFilters, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CheckDto, CheckPipe, QueueDto, QueuePipe, ReviewDto, ReviewPipe } from './dto/screening.dto'
import { ScreeningCheckService } from './screening-check.service'
import { ScreeningService } from './screening.service'

@UseFilters(F7ExceptionFilter)
@Controller('security/screenings')
export class ScreeningController {
  constructor(private readonly service: ScreeningService) {}
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(QueuePipe) query: QueueDto) {
    return this.service.list(user.id, query)
  }
  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user.id, id)
  }
  @Post(':id/reviews')
  review(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(ReviewPipe) body: ReviewDto) {
    return this.service.review(user.id, id, body)
  }
}

// Spec: Sys. HTTP remains Security-staff only until shared system auth exists.
// F3b/F6 call ScreeningCheckService.checkSystem through ScreeningModule internally.
@UseFilters(F7ExceptionFilter)
@Controller('screening')
export class ScreeningCheckController {
  constructor(private readonly checks: ScreeningCheckService) {}
  @Post('check')
  check(@CurrentUser() user: AuthenticatedUser, @Body(CheckPipe) body: CheckDto) {
    return this.checks.check(user.id, body)
  }
  @Get('status/:passengerId/:flightId')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('passengerId', ParseUUIDPipe) passengerId: string,
    @Param('flightId', ParseUUIDPipe) flightId: string,
  ) {
    return this.checks.status(user.id, passengerId, flightId)
  }
}
