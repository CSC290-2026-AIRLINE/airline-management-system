import { Body, Controller, Get, Param, Post, Query, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { rosteringValidationPipe, uuidParam } from '@backend/modules/crew-rostering/dto/validation'
import { WindowQueryDto } from '@backend/modules/crew-rostering/dto/window-query.dto'
import { RosteringExceptionFilter } from '@backend/modules/crew-rostering/rostering-error'
import { StaffOnlyGuard } from '@backend/modules/crew-rostering/staff-only.guard'
import { OverrideDto, SickCallDto, SwapDto } from './dto/fix-publish.dto'
import { FixPublishService, type FixOutcome, type FixPublishState, type PublishedRunSummary } from './fix-publish.service'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Every mutating handler takes `@CurrentUser()` because an override, a swap, a sick call and
 * a publish each write an `audit_log` row keyed on the caller's id.
 */
@Controller('crew-rostering/fix-publish')
@UseGuards(StaffOnlyGuard)
@UseFilters(RosteringExceptionFilter)
@UsePipes(rosteringValidationPipe)
export class FixPublishController {
  constructor(private readonly fixPublishService: FixPublishService) {}

  /** The run for this base and window, with its breaks, roster and publish checks. */
  @Get('state')
  async getState(@Query() query: WindowQueryDto): Promise<FixPublishState> {
    return this.fixPublishService.getState(query)
  }

  /** Every published roster, newest first, for the history page. */
  @Get('published')
  async listPublished(): Promise<PublishedRunSummary[]> {
    return this.fixPublishService.listPublished()
  }

  /** One run by id, with its roster, breaks and publish checks. */
  @Get('runs/:rosterRunId')
  async getRun(@Param('rosterRunId', uuidParam('rosterRunId')) rosterRunId: string): Promise<FixPublishState> {
    return this.fixPublishService.getRun(rosterRunId)
  }

  /** Re-reads the flights and re-checks every rule, for when feature 2 has moved something. */
  @Post('runs/:rosterRunId/check')
  async check(@Param('rosterRunId', uuidParam('rosterRunId')) rosterRunId: string): Promise<FixPublishState> {
    return this.fixPublishService.check(rosterRunId)
  }

  @Post('breaks/:breakId/swap')
  async swap(
    @Param('breakId', uuidParam('breakId')) breakId: string,
    @Body() body: SwapDto,
    @CurrentUser() user: { id: string },
  ): Promise<FixOutcome> {
    return this.fixPublishService.swap(breakId, body.replacementId, user?.id)
  }

  /** Closes a company-rule break in writing. The reason is mandatory: it is the audit record. */
  @Post('breaks/:breakId/override')
  async override(
    @Param('breakId', uuidParam('breakId')) breakId: string,
    @Body() body: OverrideDto,
    @CurrentUser() user: { id: string },
  ): Promise<FixOutcome> {
    return this.fixPublishService.override(breakId, body.reason, user?.id)
  }

  @Post('runs/:rosterRunId/sick-calls')
  async raiseSickCall(
    @Param('rosterRunId', uuidParam('rosterRunId')) rosterRunId: string,
    @Body() body: SickCallDto,
    @CurrentUser() user: { id: string },
  ): Promise<FixOutcome> {
    const { legId, memberId, reason } = body
    return this.fixPublishService.raiseSickCall(rosterRunId, { legId, memberId, reason }, user?.id)
  }

  @Post('runs/:rosterRunId/publish')
  async publish(
    @Param('rosterRunId', uuidParam('rosterRunId')) rosterRunId: string,
    @CurrentUser() user: { id: string },
  ): Promise<FixPublishState> {
    return this.fixPublishService.publish(rosterRunId, user?.id)
  }
}
