import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AssignCrewService, type AssignCrewParams, type CommittedPairingResult, type RunResult } from './assign-crew.service'
import { asObjectOrEmpty, requireDate, requireText, requireUuid } from '../request-parsing'
import { StaffOnlyGuard } from '../staff-only.guard'

/**
 * Feature 8 · Step 3 — assign crew.
 *
 * Parsing is inline rather than in a DTO folder, as this feature requires. The page
 * loads the committed pairings for a window, shows what a run already holds, runs
 * auto-assign on a selection, and can re-check a run without changing who is crewed.
 */
@Controller('crew-rostering/assign-crew')
@UseGuards(StaffOnlyGuard)
export class AssignCrewController {
  constructor(private readonly assignCrewService: AssignCrewService) {}

  @Get('bases')
  async listBases(): Promise<string[]> {
    return this.assignCrewService.listBases()
  }

  /** The run Build pairings committed for this window, and the pairings it left out. */
  @Get('pairings')
  async listCommittedPairings(@Query() query: Record<string, string | undefined>): Promise<CommittedPairingResult> {
    return this.assignCrewService.listCommittedPairings(parseParams(query))
  }

  /** Stored assignments and open rule breaks, without re-checking. */
  @Get('runs/:rosterRunId')
  async getRun(@Param('rosterRunId') rosterRunId: string): Promise<RunResult> {
    return this.assignCrewService.getRun(requireUuid(rosterRunId, 'rosterRunId'))
  }

  /** Crews the chosen pairings. An empty or missing `pairingIds` crews the whole run. */
  @Post('runs/:rosterRunId/auto-assign')
  async autoAssign(@Param('rosterRunId') rosterRunId: string, @Body() body: unknown): Promise<RunResult> {
    return this.assignCrewService.autoAssign(requireUuid(rosterRunId, 'rosterRunId'), parsePairingIds(asObjectOrEmpty(body).pairingIds))
  }

  /** Re-checks every rule without changing who is crewed. */
  @Post('runs/:rosterRunId/check')
  async check(@Param('rosterRunId') rosterRunId: string): Promise<RunResult> {
    return this.assignCrewService.check(requireUuid(rosterRunId, 'rosterRunId'))
  }
}

/* ── input parsing ──────────────────────────────────────────────────────────
 * Inline rather than in a DTO folder, as this feature requires. */

function parseParams(source: Record<string, string | undefined>): AssignCrewParams {
  const dateFrom = requireDate(source.dateFrom, 'dateFrom')
  const dateTo = requireDate(source.dateTo, 'dateTo')
  if (dateTo < dateFrom) throw new BadRequestException('dateTo must be on or after dateFrom')
  const base = requireText(source.base, 'base').toUpperCase()
  if (!/^[A-Z]{3}$/.test(base)) throw new BadRequestException('base must be a 3-letter IATA code')
  return { dateFrom, dateTo, base }
}

function parsePairingIds(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new BadRequestException('pairingIds must be an array')
  return value.map((entry, index) => requireUuid(entry, `pairingIds[${index}]`))
}
