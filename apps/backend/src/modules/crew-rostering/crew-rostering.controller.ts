import { Controller, Get, Query } from '@nestjs/common'
import { CrewRosteringService } from './crew-rostering.service'
import { parseScheduleQuery, type ScheduleQueryInput } from './dto/schedule-query.dto'
import type { AirportSummary, PairingCandidateFlight } from './crew-rostering.types'

/**
 * Read-only endpoints for the roster wizard, under the global `/api` prefix.
 * `JwtAuthGuard` is already global, so every route here needs a Bearer token
 * without any local guard.
 */
@Controller('crew-rostering')
export class CrewRosteringController {
  constructor(private readonly crewRosteringService: CrewRosteringService) {}

  /** `GET /api/crew-rostering/bases` — airports usable as a pairing base. */
  @Get('bases')
  listBases(): Promise<AirportSummary[]> {
    return this.crewRosteringService.listBases()
  }

  /**
   * `GET /api/crew-rostering/flights?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&base=BKK`
   * — the flights a pairing at that base could be built from.
   */
  @Get('flights')
  findPairingPool(@Query() query: ScheduleQueryInput): Promise<PairingCandidateFlight[]> {
    return this.crewRosteringService.findPairingPool(parseScheduleQuery(query))
  }
}
