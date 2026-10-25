import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import {
  parseAircraftChangeBody,
  parseBatchDelayBody,
  parseCancelBody,
  parseConfirmBody,
  parseDelayBody,
  parseDismissBody,
  parseDivertBody,
  parseEndHoldBody,
  parseHoldBody,
  parseResolveBody,
} from '../dto/operations.dto'
import { ConflictService, type ListConflictsQueryDto } from './conflict.service'
import { FlightConfirmService } from './flight-confirm.service'
import { FlightOperationsService } from './flight-operations.service'
import { StaffActorService } from './staff-actor.service'

// Operations writes always need a staff member, because every event and resolution records who made it.
@Controller('flight-scheduling')
export class FlightOperationsController {
  constructor(
    private readonly operations: FlightOperationsService,
    private readonly confirmation: FlightConfirmService,
    private readonly conflicts: ConflictService,
    private readonly actors: StaffActorService,
  ) {}

  @Post('flights/confirm')
  @HttpCode(201)
  async confirm(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseConfirmBody(body)
    return this.confirmation.confirm(input, await this.actors.staffIdFor(user))
  }

  // Declared before the ':id' routes so 'batch' is never read as a flight id.
  @Post('flights/batch/delay')
  @HttpCode(207)
  async batchDelay(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseBatchDelayBody(body)
    return this.operations.batchDelay(input, await this.actors.staffIdFor(user))
  }

  @Get('partner-airlines')
  listPartnerAirlines() {
    return this.operations.listPartnerAirlines()
  }

  @Get('flights/:id/events')
  listEvents(@Param('id') id: string) {
    return this.operations.listEvents(id)
  }

  @Post('flights/:id/delay')
  @HttpCode(200)
  async delay(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseDelayBody(body)
    return this.operations.delay(id, input, await this.actors.staffIdFor(user))
  }

  @Post('flights/:id/divert')
  @HttpCode(200)
  async divert(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseDivertBody(body)
    return this.operations.divert(id, input, await this.actors.staffIdFor(user))
  }

  @Post('flights/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseCancelBody(body)
    return this.operations.cancel(id, input, await this.actors.staffIdFor(user))
  }

  @Post('flights/:id/hold')
  @HttpCode(200)
  async hold(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseHoldBody(body)
    return this.operations.hold(id, input, await this.actors.staffIdFor(user))
  }

  @Post('flights/:id/hold/end')
  @HttpCode(200)
  async endHold(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { note } = parseEndHoldBody(body)
    return this.operations.endHold(id, note, await this.actors.staffIdFor(user))
  }

  @Put('flights/:id/aircraft')
  async changeAircraft(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseAircraftChangeBody(body)
    return this.operations.changeAircraft(id, input, await this.actors.staffIdFor(user))
  }

  @Get('conflicts')
  listConflicts(@Query() query: ListConflictsQueryDto) {
    return this.conflicts.list(query)
  }

  @Get('conflicts/:id/options')
  conflictOptions(@Param('id') id: string) {
    return this.conflicts.options(id)
  }

  @Post('conflicts/:id/resolve')
  @HttpCode(200)
  async resolve(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseResolveBody(body)
    return this.conflicts.resolve(id, input, await this.actors.staffIdFor(user))
  }

  @Post('conflicts/:id/dismiss')
  @HttpCode(200)
  async dismiss(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseDismissBody(body)
    return this.conflicts.dismiss(id, input, await this.actors.staffIdFor(user))
  }
}
