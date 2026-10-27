import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  BuildPairingService,
  type BuildParams,
  type CommitDraft,
  type CommitResult,
  type GenerateResult,
  type DeletePairingResult,
  type PairingListResult,
  type SaveLegInput,
  type SaveLegsResult,
} from './build-pairing.service'
import { asObject, requireDate, requireText, requireUuid } from '../request-parsing'
import { StaffOnlyGuard } from '../staff-only.guard'

/**
 * Feature 8 · Step 2 — build pairings.
 *
 * Query parsing is inline rather than in a DTO folder, as this feature requires.
 * `dateFrom`, `dateTo` and `base` appear on four routes, so they are parsed by one
 * helper and every handler gets the same `YYYY-MM-DD` and IATA validation.
 */
@Controller('crew-rostering/build-pairing')
@UseGuards(StaffOnlyGuard)
export class BuildPairingController {
  constructor(private readonly buildPairingService: BuildPairingService) {}

  @Get('bases')
  async listBases(): Promise<{ code: string; name: string }[]> {
    return this.buildPairingService.listBases()
  }

  @Get('pairings')
  async listPairings(@Query() query: Record<string, string | undefined>): Promise<PairingListResult> {
    return this.buildPairingService.listPairings(parseBuildParams(query))
  }

  @Post('pairings/generate')
  async generatePairings(@Body() body: unknown): Promise<GenerateResult> {
    return this.buildPairingService.generatePairings(parseBuildParams(asObject(body)))
  }

  /** Stores the chosen pairings and hands them to the window's draft roster run. */
  @Post('pairings/commit')
  async commitPairings(@Body() body: unknown): Promise<CommitResult> {
    const source = asObject(body)
    return this.buildPairingService.commitPairings(parseBuildParams(source), parseDrafts(source.pairings))
  }

  /** Deletes pairings stored by an earlier version of this step that were never committed. */
  @Delete('pairings')
  async clearPairings(@Query() query: Record<string, string | undefined>): Promise<{ deleted: number; kept: number }> {
    return this.buildPairingService.clearPairings(parseBuildParams(query))
  }

  @Put('pairings/:pairingId/legs')
  async saveLegs(@Param('pairingId') pairingId: string, @Body() body: unknown): Promise<SaveLegsResult> {
    return this.buildPairingService.saveLegs(requireUuid(pairingId, 'pairingId'), parseLegs(asObject(body).legs))
  }

  @Delete('pairings/:pairingId')
  async deletePairing(@Param('pairingId') pairingId: string): Promise<DeletePairingResult> {
    return this.buildPairingService.deletePairing(requireUuid(pairingId, 'pairingId'))
  }
}

/* ── input parsing ──────────────────────────────────────────────────────────
 * Inline rather than in a DTO folder, as this feature requires. */

function parseBuildParams(source: Record<string, unknown>): BuildParams {
  const dateFrom = requireDate(source.dateFrom, 'dateFrom')
  const dateTo = requireDate(source.dateTo, 'dateTo')
  if (dateTo < dateFrom) throw new BadRequestException('dateTo must be on or after dateFrom')
  const base = requireText(source.base, 'base').toUpperCase()
  if (!/^[A-Z]{3}$/.test(base)) throw new BadRequestException('base must be a 3-letter IATA code')
  return { dateFrom, dateTo, base }
}

function parseDrafts(value: unknown): CommitDraft[] {
  if (!Array.isArray(value)) throw new BadRequestException('pairings must be an array')
  const refs = new Set<string>()
  return value.map((entry, index) => {
    const draft = asObject(entry)
    const ref = requireText(draft.ref, `pairings[${index}].ref`)
    if (refs.has(ref)) throw new BadRequestException(`pairings[${index}].ref ${ref} appears twice`)
    refs.add(ref)
    const legs = parseLegs(draft.legs)
    if (legs.length === 0) throw new BadRequestException(`pairings[${index}] needs at least one flight`)
    return { ref, legs }
  })
}

function parseLegs(value: unknown): SaveLegInput[] {
  if (!Array.isArray(value)) throw new BadRequestException('legs must be an array')
  return value.map((entry, index) => {
    const leg = asObject(entry)
    return { flightId: requireUuid(leg.flightId, `legs[${index}].flightId`), addedManually: leg.addedManually === true }
  })
}
