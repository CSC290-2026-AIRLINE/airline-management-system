import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import {
  BuildPairingService,
  type AddLegCandidateRow,
  type BaseOptionRow,
  type BuildParams,
  type CommitResult,
  type FlightLegRow,
  type PairingDetailResult,
  type PairingListResult,
  type PairingRow,
  type PairingValidationResult,
  type ScheduledFlightRow,
} from './build-pairing.service'

/**
 * Feature 8 · Step 2 — build pairings.
 *
 * Query parsing is inline rather than in a DTO folder, as this feature requires.
 * `dateFrom`, `dateTo` and `base` appear on five routes, so they are parsed by one
 * helper and every handler gets the same `YYYY-MM-DD` and IATA validation.
 */
@Controller('crew-rostering/build-pairing')
export class BuildPairingController {
  constructor(private readonly buildPairingService: BuildPairingService) {}

  @Get('bases')
  async listBases(): Promise<BaseOptionRow[]> {
    return this.buildPairingService.listBases()
  }

  @Get('flights')
  async listFlights(@Query() query: Record<string, string | undefined>): Promise<ScheduledFlightRow[]> {
    return this.buildPairingService.listFlights(parseBuildParams(query))
  }

  @Post('pairings/generate')
  async generatePairings(@Body() body: unknown): Promise<PairingListResult> {
    return this.buildPairingService.generatePairings(parseBuildParams(asObject(body)))
  }

  @Get('pairings')
  async listPairings(@Query() query: Record<string, string | undefined>): Promise<PairingListResult> {
    return this.buildPairingService.listPairings(parseBuildParams(query))
  }

  /** Declared before `:pairingId` so the literal path wins. */
  @Post('pairings/validate')
  async validateDraft(@Body() body: unknown): Promise<PairingValidationResult> {
    const payload = asObject(body)
    const base = requireText(payload.base, 'base').toUpperCase()
    return this.buildPairingService.validateDraft(base, parseLegs(payload.legs))
  }

  @Delete('pairings')
  async clearPairings(@Query() query: Record<string, string | undefined>): Promise<{ releasedPairings: number }> {
    return this.buildPairingService.clearPairings(parseBuildParams(query))
  }

  @Get('pairings/:pairingId')
  async getPairing(@Param('pairingId') pairingId: string): Promise<PairingDetailResult> {
    return this.buildPairingService.getPairing(requireText(pairingId, 'pairingId'))
  }

  /** Candidate flights for the Add Leg modal, drawn from the wider schedule. */
  @Get('pairings/:pairingId/leg-candidates')
  async listLegCandidates(@Param('pairingId') pairingId: string): Promise<AddLegCandidateRow[]> {
    return this.buildPairingService.listAddLegCandidates(requireText(pairingId, 'pairingId'))
  }

  @Put('pairings/:pairingId/legs')
  async saveLegs(@Param('pairingId') pairingId: string, @Body() body: unknown): Promise<PairingDetailResult> {
    return this.buildPairingService.saveLegs(requireText(pairingId, 'pairingId'), parseLegs(asObject(body).legs))
  }

  @Delete('pairings/:pairingId')
  async deletePairing(@Param('pairingId') pairingId: string): Promise<PairingRow> {
    return this.buildPairingService.deletePairing(requireText(pairingId, 'pairingId'))
  }

  /** Hands a valid pairing over to the roster run for the window. */
  @Post('pairings/:pairingId/commit')
  async commitPairing(@Param('pairingId') pairingId: string, @Body() body: unknown): Promise<CommitResult> {
    const params = asObject(body)
    return this.buildPairingService.commitPairing(requireText(pairingId, 'pairingId'), {
      base: requireText(params.base, 'base').toUpperCase(),
      dateFrom: requireDate(params.dateFrom, 'dateFrom'),
      dateTo: requireDate(params.dateTo, 'dateTo'),
    })
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

/** ISO-8601 instants only. A bare date would silently sort wrongly against real times. */
function requireInstant(value: unknown, field: string): string {
  const text = requireText(value, field)
  if (Number.isNaN(Date.parse(text))) throw new BadRequestException(`${field} must be an ISO-8601 instant`)
  return new Date(text).toISOString()
}

function parseBuildParams(source: Record<string, unknown>): BuildParams {
  return {
    dateFrom: requireDate(source.dateFrom, 'dateFrom'),
    dateTo: requireDate(source.dateTo, 'dateTo'),
    base: requireText(source.base, 'base').toUpperCase(),
  }
}

function parseLegs(value: unknown): FlightLegRow[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new BadRequestException('legs must be an array')

  return value.map((entry, index) => {
    const leg = asObject(entry)
    return {
      flightId: requireText(leg.flightId, `legs[${index}].flightId`),
      flightNumber: requireText(leg.flightNumber, `legs[${index}].flightNumber`),
      origin: requireText(leg.origin, `legs[${index}].origin`).toUpperCase(),
      destination: requireText(leg.destination, `legs[${index}].destination`).toUpperCase(),
      departureAt: requireInstant(leg.departureAt, `legs[${index}].departureAt`),
      arrivalAt: requireInstant(leg.arrivalAt, `legs[${index}].arrivalAt`),
      addedManually: leg.addedManually === true,
    }
  })
}
