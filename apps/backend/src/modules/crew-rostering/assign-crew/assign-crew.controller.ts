import { Body, Controller, Get, Param, Post, Query, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { rosteringValidationPipe, uuidParam } from '@backend/modules/crew-rostering/dto/validation'
import { WindowQueryDto } from '@backend/modules/crew-rostering/dto/window-query.dto'
import { RosteringExceptionFilter } from '@backend/modules/crew-rostering/rostering-error'
import { StaffOnlyGuard } from '@backend/modules/crew-rostering/staff-only.guard'
import { AssignCrewService, type CommittedPairingResult, type RunResult } from './assign-crew.service'
import { AutoAssignDto, AutoAssignQueryDto } from './dto/assign-crew.dto'

/**
 * Feature 8 · Step 3 — assign crew.
 *
 * The page loads the committed pairings for a window, shows what a run already holds, runs
 * auto-assign on a selection, and can re-check a run without changing who is crewed.
 */
@Controller('crew-rostering/assign-crew')
@UseGuards(StaffOnlyGuard)
@UseFilters(RosteringExceptionFilter)
@UsePipes(rosteringValidationPipe)
export class AssignCrewController {
  constructor(private readonly assignCrewService: AssignCrewService) {}

  @Get('bases')
  async listBases(): Promise<string[]> {
    return this.assignCrewService.listBases()
  }

  /** The run Build pairings committed for this window, and the pairings it left out. */
  @Get('pairings')
  async listCommittedPairings(@Query() query: WindowQueryDto): Promise<CommittedPairingResult> {
    return this.assignCrewService.listCommittedPairings(query)
  }

  /** Stored assignments and open rule breaks, without re-checking. */
  @Get('runs/:rosterRunId')
  async getRun(@Param('rosterRunId', uuidParam('rosterRunId')) rosterRunId: string): Promise<RunResult> {
    return this.assignCrewService.getRun(rosterRunId)
  }

  /**
   * Crews the chosen pairings with legal crew only. An empty or missing `pairingIds` crews the whole run.
   * `?demoBreaks=true` lets the dice plant rule breaks for Ops to fix, for demos.
   */
  @Post('runs/:rosterRunId/auto-assign')
  async autoAssign(
    @Param('rosterRunId', uuidParam('rosterRunId')) rosterRunId: string,
    @Body() body: AutoAssignDto,
    @Query() query: AutoAssignQueryDto,
    @CurrentUser() user: { id: string },
  ): Promise<RunResult> {
    return this.assignCrewService.autoAssign(rosterRunId, body.pairingIds, { demoBreaks: query.demoBreaks === 'true' }, user.id)
  }
}
