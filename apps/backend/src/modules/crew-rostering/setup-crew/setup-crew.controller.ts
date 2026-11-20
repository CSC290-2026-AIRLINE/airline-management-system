import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { rosteringValidationPipe, uuidParam } from '@backend/modules/crew-rostering/dto/validation'
import { RosteringExceptionFilter } from '@backend/modules/crew-rostering/rostering-error'
import { StaffOnlyGuard } from '@backend/modules/crew-rostering/staff-only.guard'
import { CertificationDto, CrewProfileDto, ListCrewQueryDto } from './dto/setup-crew.dto'
import {
  SetupCrewService,
  type BaseOptionRow,
  type CertificationRow,
  type CrewListResult,
  type CrewMemberRow,
  type FleetOptionRow,
  type LanguageOptionRow,
} from './setup-crew.service'

/**
 * Feature 8 · Step 1 — crew directory.
 *
 * Thin on purpose: input is validated at the boundary by the DTOs in `dto/` and the
 * UUID pipes on path parameters, and each handler hands the typed value to the service.
 */
@Controller('crew-rostering/setup-crew')
@UseGuards(StaffOnlyGuard)
@UseFilters(RosteringExceptionFilter)
@UsePipes(rosteringValidationPipe)
export class SetupCrewController {
  constructor(private readonly setupCrewService: SetupCrewService) {}

  @Get('bases')
  async listBases(): Promise<BaseOptionRow[]> {
    return this.setupCrewService.listBases()
  }

  @Get('fleets')
  async listFleets(): Promise<FleetOptionRow[]> {
    return this.setupCrewService.listFleets()
  }

  @Get('languages')
  async listLanguages(): Promise<LanguageOptionRow[]> {
    return this.setupCrewService.listLanguages()
  }

  @Get('crew')
  async listCrew(@Query() query: ListCrewQueryDto): Promise<CrewListResult> {
    return this.setupCrewService.listCrew(query)
  }

  /**
   * Declared before `:crewId` so the literal path wins — Nest matches handlers in
   * declaration order, and `suggest-employee-no` would otherwise be read as an id.
   */
  @Get('crew/suggest-employee-no')
  async suggestEmployeeNo(): Promise<{ employeeNo: string }> {
    return { employeeNo: await this.setupCrewService.suggestEmployeeNo() }
  }

  @Get('crew/:crewId')
  async getCrew(@Param('crewId', uuidParam('crewId')) crewId: string): Promise<CrewMemberRow> {
    return this.setupCrewService.getCrew(crewId)
  }

  @Post('crew')
  async createCrew(@Body() body: CrewProfileDto, @CurrentUser() user: { id: string }): Promise<CrewMemberRow> {
    return this.setupCrewService.createCrew(body, user.id)
  }

  @Put('crew/:crewId')
  async updateCrew(
    @Param('crewId', uuidParam('crewId')) crewId: string,
    @Body() body: CrewProfileDto,
    @CurrentUser() user: { id: string },
  ): Promise<CrewMemberRow> {
    return this.setupCrewService.updateCrew(crewId, body, user.id)
  }

  @Post('crew/:crewId/certifications')
  async addCertification(
    @Param('crewId', uuidParam('crewId')) crewId: string,
    @Body() body: CertificationDto,
    @CurrentUser() user: { id: string },
  ): Promise<CertificationRow> {
    return this.setupCrewService.addCertification(crewId, body, user.id)
  }

  @Put('crew/:crewId/certifications/:certificationId')
  async updateCertification(
    @Param('crewId', uuidParam('crewId')) crewId: string,
    @Param('certificationId', uuidParam('certificationId')) certificationId: string,
    @Body() body: CertificationDto,
    @CurrentUser() user: { id: string },
  ): Promise<CertificationRow> {
    return this.setupCrewService.updateCertification(crewId, certificationId, body, user.id)
  }

  @Delete('crew/:crewId/certifications/:certificationId')
  @HttpCode(204)
  async removeCertification(
    @Param('crewId', uuidParam('crewId')) crewId: string,
    @Param('certificationId', uuidParam('certificationId')) certificationId: string,
    @CurrentUser() user: { id: string },
  ): Promise<void> {
    await this.setupCrewService.removeCertification(crewId, certificationId, user.id)
  }
}
