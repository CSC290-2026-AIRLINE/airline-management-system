import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { AssignCrewService, type AssignCrewParams, type CommittedPairingResult, type RunResult } from './assign-crew.service'

/**
 * Feature 8 · Step 3 — assign crew.
 *
 * Parsing is inline rather than in a DTO folder, as this feature requires. The page
 * loads the committed pairings for a window, shows what a run already holds, runs
 * auto-assign on a selection, and can re-check a run without changing who is crewed.
 */
@Controller('crew-rostering/assign-crew')
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
    return this.assignCrewService.autoAssign(requireUuid(rosterRunId, 'rosterRunId'), parsePairingIds(asObject(body).pairingIds))
  }

  /** Re-checks every rule without changing who is crewed. */
  @Post('runs/:rosterRunId/check')
  async check(@Param('rosterRunId') rosterRunId: string): Promise<RunResult> {
    return this.assignCrewService.check(requireUuid(rosterRunId, 'rosterRunId'))
  }
}

/* ── input parsing ──────────────────────────────────────────────────────────
 * Inline rather than in a DTO folder, as this feature requires. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asObject(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {}
  if (typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Request body must be a JSON object')
  return body as Record<string, unknown>
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequestException(`${field} is required`)
  return value.trim()
}

/** Ids reach Postgres as UUID parameters, so a malformed one is a 400 here rather than a 500 there. */
function requireUuid(value: unknown, field: string): string {
  const text = requireText(value, field)
  if (!UUID.test(text)) throw new BadRequestException(`${field} must be a UUID`)
  return text
}

function requireDate(value: unknown, field: string): string {
  const text = requireText(value, field)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`)))
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date`)
  return text
}

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
