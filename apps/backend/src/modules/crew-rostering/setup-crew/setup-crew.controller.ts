import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import {
  CREW_ROLES,
  SetupCrewService,
  type BaseOptionRow,
  type CertificationInput,
  type CertificationRow,
  type CrewListQuery,
  type CrewListResult,
  type CrewMemberRow,
  type CrewProfileInput,
  type CrewRole,
  type FleetOptionRow,
  type LanguageOptionRow,
} from './setup-crew.service'
import { asObject, requireDate, requireText, requireUuid } from '../request-parsing'
import { StaffOnlyGuard } from '../staff-only.guard'

/**
 * Feature 8 · Step 1 — crew directory.
 *
 * Thin on purpose: every handler parses its own input and hands a typed value to the
 * service. There are no DTO classes for this feature, so the checks below are the
 * whole validation layer and they must stay as strict as a DTO would be.
 */
@Controller('crew-rostering/setup-crew')
@UseGuards(StaffOnlyGuard)
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
  async listCrew(@Query() query: Record<string, string | undefined>): Promise<CrewListResult> {
    const parsed: CrewListQuery = {}
    const term = query.search?.trim()
    if (term) parsed.search = term
    if (query.base && query.base !== 'all') parsed.base = requireText(query.base, 'base')
    if (query.role && query.role !== 'all') parsed.role = parseRole(query.role)

    return this.setupCrewService.listCrew(parsed)
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
  async getCrew(@Param('crewId') crewId: string): Promise<CrewMemberRow> {
    return this.setupCrewService.getCrew(requireUuid(crewId, 'crewId'))
  }

  @Post('crew')
  async createCrew(@Body() body: unknown): Promise<CrewMemberRow> {
    return this.setupCrewService.createCrew(parseProfile(asObject(body)))
  }

  @Patch('crew/:crewId')
  async updateCrew(@Param('crewId') crewId: string, @Body() body: unknown): Promise<CrewMemberRow> {
    return this.setupCrewService.updateCrew(requireUuid(crewId, 'crewId'), parseProfile(asObject(body)))
  }

  @Post('crew/:crewId/certifications')
  async addCertification(@Param('crewId') crewId: string, @Body() body: unknown): Promise<CertificationRow> {
    return this.setupCrewService.addCertification(requireUuid(crewId, 'crewId'), parseCertification(asObject(body)))
  }

  @Patch('crew/:crewId/certifications/:certificationId')
  async updateCertification(
    @Param('crewId') crewId: string,
    @Param('certificationId') certificationId: string,
    @Body() body: unknown,
  ): Promise<CertificationRow> {
    return this.setupCrewService.updateCertification(
      requireUuid(crewId, 'crewId'),
      requireUuid(certificationId, 'certificationId'),
      parseCertification(asObject(body)),
    )
  }

  @Delete('crew/:crewId/certifications/:certificationId')
  @HttpCode(204)
  async removeCertification(@Param('crewId') crewId: string, @Param('certificationId') certificationId: string): Promise<void> {
    await this.setupCrewService.removeCertification(requireUuid(crewId, 'crewId'), requireUuid(certificationId, 'certificationId'))
  }
}

/* ── input parsing ──────────────────────────────────────────────────────────
 * Inline rather than in a DTO folder, as this feature requires. Each helper throws
 * a `BadRequestException` naming the field, which is what a class-validator message
 * would have done. */

/** An optional string. Anything non-string other than `null`/`undefined` is a bad request. */
function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`)
  return value.trim() === '' ? null : value.trim()
}

function optionalEmail(value: unknown): string | null {
  const email = optionalText(value, 'email')
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('email must be a valid address')
  return email
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  return requireDate(value, field)
}

function parseRole(value: unknown): CrewRole {
  const text = requireText(value, 'role')
  if (!CREW_ROLES.includes(text as CrewRole)) throw new BadRequestException(`role must be one of ${CREW_ROLES.join(', ')}`)
  return text as CrewRole
}

function parseLanguages(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new BadRequestException('languages must be an array of codes')
  return value.map((entry, index) => {
    const code = requireText(entry, `languages[${index}]`).toLowerCase()
    if (!/^[a-z]{2}$/.test(code)) throw new BadRequestException(`languages[${index}] must be a 2-letter language code`)
    return code
  })
}

function parseProfile(body: Record<string, unknown>): CrewProfileInput {
  return {
    firstName: requireText(body.firstName, 'firstName'),
    lastName: requireText(body.lastName, 'lastName'),
    employeeNo: requireText(body.employeeNo, 'employeeNo'),
    role: parseRole(body.role),
    base: requireText(body.base, 'base').toUpperCase(),
    fleet: requireText(body.fleet, 'fleet'),
    languages: parseLanguages(body.languages),
    licenceNumber: requireText(body.licenceNumber, 'licenceNumber'),
    licenceExpiresOn: requireDate(body.licenceExpiresOn, 'licenceExpiresOn'),
    dateOfBirth: optionalDate(body.dateOfBirth, 'dateOfBirth'),
    email: optionalEmail(body.email),
    phone: optionalText(body.phone, 'phone'),
  }
}

function parseCertification(body: Record<string, unknown>): CertificationInput {
  return {
    name: requireText(body.name, 'name'),
    aircraftType: optionalText(body.aircraftType, 'aircraftType'),
    expiresOn: requireDate(body.expiresOn, 'expiresOn'),
  }
}
