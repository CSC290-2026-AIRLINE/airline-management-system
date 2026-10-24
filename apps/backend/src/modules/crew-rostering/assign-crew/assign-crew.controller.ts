import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common'
import {
  AssignCrewService,
  type AssignableCrewRow,
  type AssignmentRequest,
  type AssignmentSummaryRow,
  type AutoAssignResult,
  type CommittedPairingResult,
  type RuleBreakRow,
} from './assign-crew.service'

/**
 * Feature 8 · Step 3 — assign crew.
 *
 * Parsing is inline rather than in a DTO folder, as this feature requires. The three
 * actions the page has — load, crew, check — map one-to-one onto the handlers below.
 */
@Controller('crew-rostering/assign-crew')
export class AssignCrewController {
  constructor(private readonly assignCrewService: AssignCrewService) {}

  @Get('bases')
  async listBases(): Promise<string[]> {
    return this.assignCrewService.listBases()
  }

  /** What Build pairings handed over for this window, and what it did not. */
  @Get('pairings')
  async listCommittedPairings(@Query() query: Record<string, string | undefined>): Promise<CommittedPairingResult> {
    return this.assignCrewService.listCommittedPairings(parseParams(query))
  }

  /** Everyone who could be offered a seat, with ratings and busy ranges. */
  @Get('crew')
  async listAssignableCrew(@Query() query: Record<string, string | undefined>): Promise<AssignableCrewRow[]> {
    return this.assignCrewService.listAssignableCrew(parseParams(query))
  }

  @Post('auto-assign')
  async autoAssign(@Body() body: unknown): Promise<AutoAssignResult> {
    return this.assignCrewService.autoAssign(parseAssignmentRequest(asObject(body)))
  }

  /** Recomputes every rule without changing who is crewed. */
  @Post('breaks/evaluate')
  async evaluateBreaks(@Body() body: unknown): Promise<{ breaks: RuleBreakRow[] }> {
    return { breaks: await this.assignCrewService.evaluateRun(requireText(asObject(body).rosterRunId, 'rosterRunId')) }
  }

  @Get('breaks')
  async listBreaks(@Query() query: Record<string, string | undefined>): Promise<RuleBreakRow[]> {
    return this.assignCrewService.listBreaks(requireText(query.rosterRunId, 'rosterRunId'))
  }

  @Get('coverage')
  async getCoverage(@Query() query: Record<string, string | undefined>): Promise<AssignmentSummaryRow> {
    return this.assignCrewService.getCoverage(requireText(query.rosterRunId, 'rosterRunId'))
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

function requireDate(value: unknown, field: string): string {
  const text = requireText(value, field)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`)))
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date`)
  return text
}

function parseParams(source: Record<string, string | undefined>): { dateFrom: string; dateTo: string; base: string } {
  const dateFrom = requireDate(source.dateFrom, 'dateFrom')
  const dateTo = requireDate(source.dateTo, 'dateTo')
  if (dateTo < dateFrom) throw new BadRequestException('dateTo must be on or after dateFrom')
  return { dateFrom, dateTo, base: requireText(source.base, 'base').toUpperCase() }
}

function parseAssignmentRequest(body: Record<string, unknown>): AssignmentRequest {
  const pairingIds = body.pairingIds
  if (pairingIds !== undefined && pairingIds !== null && !Array.isArray(pairingIds))
    throw new BadRequestException('pairingIds must be an array')
  return {
    rosterRunId: requireText(body.rosterRunId, 'rosterRunId'),
    pairingIds: (pairingIds ?? []).map((entry, index) => requireText(entry, `pairingIds[${index}]`)),
  }
}
