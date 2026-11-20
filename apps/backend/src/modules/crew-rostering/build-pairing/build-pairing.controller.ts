import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { rosteringValidationPipe, uuidParam } from '@backend/modules/crew-rostering/dto/validation'
import { WindowQueryDto } from '@backend/modules/crew-rostering/dto/window-query.dto'
import { RosteringExceptionFilter } from '@backend/modules/crew-rostering/rostering-error'
import { StaffOnlyGuard } from '@backend/modules/crew-rostering/staff-only.guard'
import { CommitPairingsDto, SaveLegsDto } from './dto/build-pairing.dto'
import {
  BuildPairingService,
  type CommitResult,
  type DeletePairingResult,
  type FlightImpactRow,
  type GenerateResult,
  type PairingListResult,
  type SaveLegsResult,
} from './build-pairing.service'

/**
 * Feature 8 · Step 2 — build pairings.
 *
 * `dateFrom`, `dateTo` and `base` appear on four routes, so they share `WindowQueryDto`
 * and every handler gets the same `YYYY-MM-DD` and IATA validation.
 */
@Controller('crew-rostering/build-pairing')
@UseGuards(StaffOnlyGuard)
@UseFilters(RosteringExceptionFilter)
@UsePipes(rosteringValidationPipe)
export class BuildPairingController {
  constructor(
    private readonly buildPairingService: BuildPairingService,
    private readonly clock: SimulationClock,
  ) {}

  /** The simulation clock's now, which the page opens its date range on. It is the real time until the clock is shifted. */
  @Get('clock')
  getClock(): { now: string } {
    return { now: this.clock.now().toISOString() }
  }

  @Get('bases')
  async listBases(): Promise<{ code: string; name: string }[]> {
    return this.buildPairingService.listBases()
  }

  @Get('pairings')
  async listPairings(@Query() query: WindowQueryDto): Promise<PairingListResult> {
    return this.buildPairingService.listPairings(query)
  }

  @Post('pairings/generate')
  async generatePairings(@Body() body: WindowQueryDto): Promise<GenerateResult> {
    return this.buildPairingService.generatePairings(body)
  }

  /** The pairings and crew a change to this flight affects. Feature 2 uses it to re-check rosters. */
  @Get('flights/:flightId/impact')
  async flightImpact(@Param('flightId', uuidParam('flightId')) flightId: string): Promise<FlightImpactRow> {
    return this.buildPairingService.flightImpact(flightId)
  }

  /** Stores the chosen pairings and hands them to the window's draft roster run. */
  @Post('pairings/commit')
  async commitPairings(@Body() body: CommitPairingsDto, @CurrentUser() user: { id: string }): Promise<CommitResult> {
    const { dateFrom, dateTo, base, pairings } = body
    return this.buildPairingService.commitPairings({ dateFrom, dateTo, base }, pairings, user.id)
  }

  @Put('pairings/:pairingId/legs')
  async saveLegs(
    @Param('pairingId', uuidParam('pairingId')) pairingId: string,
    @Body() body: SaveLegsDto,
    @CurrentUser() user: { id: string },
  ): Promise<SaveLegsResult> {
    return this.buildPairingService.saveLegs(pairingId, body.legs, user.id)
  }

  @Delete('pairings/:pairingId')
  async deletePairing(
    @Param('pairingId', uuidParam('pairingId')) pairingId: string,
    @CurrentUser() user: { id: string },
  ): Promise<DeletePairingResult> {
    return this.buildPairingService.deletePairing(pairingId, user.id)
  }
}
