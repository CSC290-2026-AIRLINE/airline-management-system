import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import {
  FixPublishService,
  type FixBreakRow,
  type PublishCheckRow,
  type PublishResultRow,
  type ReplacementSetRow,
  type ResolutionRow,
  type RosterStatusRow,
  type SickCallRow,
} from './fix-publish.service'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Parsing is inline rather than in a DTO folder, as this feature requires. Every
 * mutating handler takes `@CurrentUser()` because an override, a swap and a publish
 * all write an `audit_log` row keyed on the caller's id.
 */
@Controller('crew-rostering/fix-publish')
export class FixPublishController {
  constructor(private readonly fixPublishService: FixPublishService) {}

  /** Open items first, then the closed table. */
  @Get('breaks')
  async listFixBreaks(@Query() query: Record<string, string | undefined>): Promise<FixBreakRow[]> {
    return this.fixPublishService.listFixBreaks(requireText(query.rosterRunId, 'rosterRunId'))
  }

  @Get('roster')
  async getRosterStatus(@Query() query: Record<string, string | undefined>): Promise<RosterStatusRow> {
    return this.fixPublishService.getRosterStatus(requireText(query.rosterRunId, 'rosterRunId'))
  }

  /** Everyone who could take the seat this item names, allowed or not. */
  @Get('breaks/:breakId/candidates')
  async getReplacementCandidates(@Param('breakId') breakId: string): Promise<ReplacementSetRow> {
    return this.fixPublishService.getReplacementCandidates(requireText(breakId, 'breakId'))
  }

  @Post('breaks/:breakId/swap')
  async applySwap(@Param('breakId') breakId: string, @Body() body: unknown, @CurrentUser() user: { id: string }): Promise<ResolutionRow> {
    const payload = asObject(body)
    return this.fixPublishService.applySwap(
      {
        breakId: requireText(breakId, 'breakId'),
        replacementId: requireText(payload.replacementId, 'replacementId'),
        note: optionalText(payload.note) ?? undefined,
      },
      user?.id,
    )
  }

  /** Closes the item in writing. The reason is mandatory — it is the audit record. */
  @Post('breaks/:breakId/override')
  async applyOverride(
    @Param('breakId') breakId: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<ResolutionRow> {
    return this.fixPublishService.applyOverride(
      { breakId: requireText(breakId, 'breakId'), reason: requireLongText(asObject(body).reason, 'reason') },
      user?.id,
    )
  }

  /** Puts back the seat the last swap on this item took away. */
  @Post('breaks/:breakId/undo')
  @HttpCode(200)
  async undoSwap(@Param('breakId') breakId: string): Promise<{ restoredCrewId: string | null }> {
    return this.fixPublishService.undoSwap(requireText(breakId, 'breakId'))
  }

  @Post('sick-calls')
  async raiseSickCall(@Body() body: unknown, @CurrentUser() user: { id: string }): Promise<SickCallRow> {
    const payload = asObject(body)
    return this.fixPublishService.raiseSickCall(
      {
        rosterRunId: requireText(payload.rosterRunId, 'rosterRunId'),
        legId: requireText(payload.legId, 'legId'),
        memberId: requireText(payload.memberId, 'memberId'),
        reason: requireLongText(payload.reason, 'reason'),
      },
      user?.id,
    )
  }

  /** One row per pairing, for the table above the publish button. */
  @Get('publish-checks')
  async listPublishChecks(@Query() query: Record<string, string | undefined>): Promise<PublishCheckRow[]> {
    return this.fixPublishService.listPublishChecks(requireText(query.rosterRunId, 'rosterRunId'))
  }

  @Post('publish')
  async publish(@Body() body: unknown, @CurrentUser() user: { id: string }): Promise<PublishResultRow> {
    return this.fixPublishService.publish(requireText(asObject(body).rosterRunId, 'rosterRunId'), user?.id)
  }
}

/* ── input parsing ──────────────────────────────────────────────────────────
 * Inline rather than in a DTO folder, as this feature requires. */

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Request body must be a JSON object')
  return body as Record<string, unknown>
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequestException(`${field} is required`)
  return value.trim()
}

/**
 * A reason an operator has to actually write.
 *
 * Longer than a name because an override with a one-word reason is not an audit
 * record; this is the only place the length is enforced, so it is enforced here.
 */
function requireLongText(value: unknown, field: string): string {
  const text = requireText(value, field)
  if (text.length < 10) throw new BadRequestException(`${field} must be at least 10 characters — an override is an audit record`)
  return text
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new BadRequestException('note must be a string')
  return value.trim()
}
