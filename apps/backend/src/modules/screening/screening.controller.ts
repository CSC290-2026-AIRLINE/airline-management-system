import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CheckDto, CheckPipe, QueueDto, QueuePipe, ReviewDto, ReviewPipe } from './dto/screening.dto'
import { ScreeningCheckService } from './screening-check.service'
import { ScreeningService } from './screening.service'

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

// This HTTP entry point is restricted to security. Other features must agree their authorization before integrating.
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
