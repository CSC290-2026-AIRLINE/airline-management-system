import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { FixPublishService, type FixOutcome, type FixPublishState, type WindowParams } from './fix-publish.service'
import { asObjectOrEmpty, requireDate, requireText, requireUuid } from '../request-parsing'
import { StaffOnlyGuard } from '../staff-only.guard'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Parsing is inline rather than in a DTO folder, as this feature requires. Every
 * mutating handler takes `@CurrentUser()` because an override, a swap, a sick call and
 * a publish each write an `audit_log` row keyed on the caller's id.
 */
@Controller('crew-rostering/fix-publish')
@UseGuards(StaffOnlyGuard)
export class FixPublishController {
  constructor(private readonly fixPublishService: FixPublishService) {}

  /** The run for this base and window, with its breaks, roster and publish checks. */
  @Get('state')
  async getState(@Query() query: Record<string, string | undefined>): Promise<FixPublishState> {
    return this.fixPublishService.getState(parseWindow(query))
  }

  /** Re-reads the flights and re-checks every rule, for when feature 2 has moved something. */
  @Post('runs/:rosterRunId/check')
  async check(@Param('rosterRunId') rosterRunId: string): Promise<FixPublishState> {
    return this.fixPublishService.check(requireUuid(rosterRunId, 'rosterRunId'))
  }

  @Post('breaks/:breakId/swap')
  async swap(@Param('breakId') breakId: string, @Body() body: unknown, @CurrentUser() user: { id: string }): Promise<FixOutcome> {
    return this.fixPublishService.swap(
      requireUuid(breakId, 'breakId'),
      requireUuid(asObjectOrEmpty(body).replacementId, 'replacementId'),
      user?.id,
    )
  }

  /** Closes a company-rule break in writing. The reason is mandatory: it is the audit record. */
  @Post('breaks/:breakId/override')
  async override(@Param('breakId') breakId: string, @Body() body: unknown, @CurrentUser() user: { id: string }): Promise<FixOutcome> {
    return this.fixPublishService.override(requireUuid(breakId, 'breakId'), requireText(asObjectOrEmpty(body).reason, 'reason'), user?.id)
  }

  @Post('runs/:rosterRunId/sick-calls')
  async raiseSickCall(
    @Param('rosterRunId') rosterRunId: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<FixOutcome> {
    const payload = asObjectOrEmpty(body)
    return this.fixPublishService.raiseSickCall(
      requireUuid(rosterRunId, 'rosterRunId'),
      {
        legId: requireUuid(payload.legId, 'legId'),
        memberId: requireUuid(payload.memberId, 'memberId'),
        reason: requireText(payload.reason, 'reason'),
      },
      user?.id,
    )
  }

  @Post('runs/:rosterRunId/publish')
  async publish(@Param('rosterRunId') rosterRunId: string, @CurrentUser() user: { id: string }): Promise<FixPublishState> {
    return this.fixPublishService.publish(requireUuid(rosterRunId, 'rosterRunId'), user?.id)
  }
}

/* ── input parsing ──────────────────────────────────────────────────────────
 * Inline rather than in a DTO folder, as this feature requires. */

function parseWindow(source: Record<string, string | undefined>): WindowParams {
  const dateFrom = requireDate(source.dateFrom, 'dateFrom')
  const dateTo = requireDate(source.dateTo, 'dateTo')
  if (dateTo < dateFrom) throw new BadRequestException('dateTo must be on or after dateFrom')
  const base = requireText(source.base, 'base').toUpperCase()
  if (!/^[A-Z]{3}$/.test(base)) throw new BadRequestException('base must be a 3-letter IATA code')
  return { dateFrom, dateTo, base }
}
