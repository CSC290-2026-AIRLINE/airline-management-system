import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { Prisma } from '@backend/db/generated/prisma/client'
import { countryName } from '../country-names'
import { localTime } from '../crew-format'

/**
 * Feature 8 · Step 1 — crew directory.
 *
 * Owns `crew` and `crew_certification` and nothing else. Base, fleet and language
 * pickers are read from the tables that already exist (`airport`, `aircraft_type`,
 * `country_language`) rather than duplicated here.
 *
 * Roles are stored lowercase-snake in the database — the same vocabulary
 * `pairing_leg_assignment.role` uses — and translated to the labels the page prints
 * on the way out, so a seat written by step 2 and a role written by step 1 are
 * always the same word.
 */

/** Role as stored in `crew.role`. */
export const CREW_ROLES = ['captain', 'first_officer', 'cabin_crew', 'police'] as const
export type CrewRole = (typeof CREW_ROLES)[number]

export type CrewRoleLabel = 'Captain' | 'First Officer' | 'Cabin Crew' | 'Flight Police'

export const CREW_ROLE_LABEL: Record<CrewRole, CrewRoleLabel> = {
  captain: 'Captain',
  first_officer: 'First Officer',
  cabin_crew: 'Cabin Crew',
  police: 'Flight Police',
}

/** Roles that count as flight crew for the `pilots` metric card. */
export const PILOT_ROLES: readonly CrewRole[] = ['captain', 'first_officer']

/** Rolling window the `hours28d` figure is measured over. */
export const HOURS_WINDOW_DAYS = 28

export interface CertificationRow {
  id: string
  name: string
  /** Null for certifications not tied to one airframe, e.g. CRM. */
  aircraftType: string | null
  /** `YYYY-MM-DD`. */
  expiresOn: string
}

export interface UpcomingDutyRow {
  id: string
  /** `YYYY-MM-DD`. */
  date: string
  flightNumber: string
  origin: string
  destination: string
  /** `HH:mm` local to the departure airport. */
  departureLocal: string
  /** `HH:mm` local to the arrival airport. */
  arrivalLocal: string
  pairingId: string
  rosterStatus: 'Draft' | 'Published'
}

export interface CrewMemberRow {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  role: CrewRole
  roleLabel: CrewRoleLabel
  /** Base airport IATA code. */
  base: string
  /** Name of the country the base airport is in; this is where the crew member counts as local. */
  baseCountry: string
  fleet: string
  languages: string[]
  /** `YYYY-MM-DD`, null when not recorded. */
  dateOfBirth: string | null
  email: string | null
  phone: string | null
  licenceNumber: string
  licenceExpiresOn: string
  /** Cumulative flight hours in the rolling 28-day window. */
  hours28d: number
  /** Legal cap for that window, from `crew_setting.max_flight_hours_28d`. */
  hoursCap: number
  certifications: CertificationRow[]
  upcomingDuties: UpcomingDutyRow[]
}

export interface CrewMetricsRow {
  totalCrew: number
  pilots: number
  cabinCrew: number
  flightPolice: number
}

export interface CrewListResult {
  crew: CrewMemberRow[]
  metrics: CrewMetricsRow
  /** Days before expiry that a licence or certification starts to show as expiring soon (`crew_setting`). */
  expiryWarningDays: number
}

export interface CrewProfileInput {
  firstName: string
  lastName: string
  employeeNo: string
  role: CrewRole
  base: string
  fleet: string
  languages: string[]
  licenceNumber: string
  licenceExpiresOn: string
  dateOfBirth: string | null
  email: string | null
  phone: string | null
}

export interface CertificationInput {
  name: string
  aircraftType: string | null
  expiresOn: string
}

export interface BaseOptionRow {
  code: string
  name: string
}

export interface FleetOptionRow {
  code: string
  label: string
}

export interface LanguageOptionRow {
  code: string
  label: string
}

export interface CrewListQuery {
  search?: string
  base?: string
  role?: CrewRole
}

/** Shape of the row as it comes back from Prisma — kept private, never leaks out. */
interface CrewDbRow {
  id: string
  first_name: string
  last_name: string
  employee_number: string
  role: string
  base_airport: string
  airport: { country: string }
  fleet_aircraft_type: string
  languages: string[]
  date_of_birth: Date | null
  email: string | null
  phone: string | null
  licence_number: string
  licence_expires_on: Date
  crew_certification: {
    id: string
    name: string
    aircraft_type: string | null
    expires_on: Date
  }[]
}

const CREW_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  employee_number: true,
  role: true,
  base_airport: true,
  airport: { select: { country: true } },
  fleet_aircraft_type: true,
  languages: true,
  date_of_birth: true,
  email: true,
  phone: true,
  licence_number: true,
  licence_expires_on: true,
  crew_certification: { select: { id: true, name: true, aircraft_type: true, expires_on: true } },
} as const

/** `YYYY-MM-DD` in UTC — the shape every date field leaves the service in. */
function localDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

/**
 * Number of hours between two instants, rounded to one decimal.
 *
 * Rounded because the metric card and the legality check both compare against a
 * half-hour rule; carrying full precision would make `11.999999` and `12` disagree
 * about whether a crew member is legal.
 */
function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10
}

@Injectable()
export class SetupCrewService {
  constructor(private readonly db: DbService) {}

  /** Bases the crew directory can filter on: every active airport. */
  async listBases(): Promise<BaseOptionRow[]> {
    const rows = await this.db.airport.findMany({
      where: { is_active: true },
      select: { iata_code: true, name: true },
      orderBy: { iata_code: 'asc' },
    })
    return rows.map((row) => ({ code: row.iata_code, name: row.name }))
  }

  /**
   * Fleets a crew member can be rated on: the model of every active aircraft type.
   *
   * `crew.fleet_aircraft_type` holds the model (A320), which every layout version of the
   * type shares, not the layout-specific `aircraft_type.code` (A320-V2).
   */
  async listFleets(): Promise<FleetOptionRow[]> {
    const rows = await this.db.aircraft_type.findMany({
      where: { is_active: true },
      select: { model: true },
      distinct: ['model'],
      orderBy: { model: 'asc' },
    })
    return rows.map((row) => ({ code: row.model, label: row.model }))
  }

  /**
   * Languages a crew profile can carry.
   *
   * Sourced from `country_language`, which is also what makes a language "local" in
   * step 3 — listing the two from different tables would let the two drift.
   */
  async listLanguages(): Promise<LanguageOptionRow[]> {
    const rows = await this.db.country_language.findMany({
      select: { language_code: true },
      distinct: ['language_code'],
      orderBy: { language_code: 'asc' },
    })
    return rows.map((row) => ({ code: row.language_code, label: row.language_code }))
  }

  /**
   * The directory, filtered.
   *
   * `search` matches either name or employee number, case-insensitively. Filtering
   * happens here rather than in the client so the metric cards can keep counting the
   * whole roster — they are derived from the unfiltered set below, not from this list.
   */
  async listCrew(query: CrewListQuery): Promise<CrewListResult> {
    const all = (await this.db.crew.findMany({
      where: { deleted_at: null },
      select: CREW_SELECT,
      orderBy: { last_name: 'asc' },
    })) as CrewDbRow[]
    const term = query.search?.trim().toLowerCase() ?? ''
    const matched = all.filter((row) => {
      if (query.base && row.base_airport !== query.base) return false
      if (query.role && row.role !== query.role) return false
      if (!term) return true
      return `${row.first_name} ${row.last_name}`.toLowerCase().includes(term) || row.employee_number.toLowerCase().includes(term)
    })

    const crew = await this.memberRows(matched)

    const metrics: CrewMetricsRow = {
      totalCrew: all.length,
      pilots: all.filter((row) => PILOT_ROLES.includes(row.role as CrewRole)).length,
      cabinCrew: all.filter((row) => row.role === 'cabin_crew').length,
      flightPolice: all.filter((row) => row.role === 'police').length,
    }

    return { crew, metrics, expiryWarningDays: await this.getExpiryWarningDays() }
  }

  /** One profile, certifications and upcoming duties included. */
  async getCrew(crewId: string): Promise<CrewMemberRow> {
    const row = await this.db.crew.findFirst({ where: { id: crewId, deleted_at: null }, select: CREW_SELECT })
    if (!row) throw new NotFoundException(`Crew ${crewId} was not found`)

    return (await this.memberRows([row]))[0]
  }

  /** The next free employee number, e.g. `EMP-2202`, for the create form to pre-fill. */
  async suggestEmployeeNo(): Promise<string> {
    const rows = await this.db.crew.findMany({ where: { deleted_at: null }, select: { employee_number: true } })
    const highest = rows.reduce((max, row) => {
      const digits = /(\d+)\s*$/.exec(row.employee_number)
      return digits ? Math.max(max, Number(digits[1])) : max
    }, 0)
    return `EMP-${highest + 1}`
  }

  async createCrew(input: CrewProfileInput): Promise<CrewMemberRow> {
    await this.assertEmployeeNoFree(input.employeeNo)
    await this.assertLicenceNumberFree(input.licenceNumber)
    await this.assertBaseActive(input.base)
    const fleet = await this.resolveFleet(input.fleet)

    const created = await this.db.crew.create({
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        employee_number: input.employeeNo,
        role: input.role,
        base_airport: input.base,
        fleet_aircraft_type: fleet,
        languages: input.languages,
        licence_number: input.licenceNumber,
        licence_expires_on: new Date(input.licenceExpiresOn),
        date_of_birth: input.dateOfBirth === null ? null : new Date(input.dateOfBirth),
        email: input.email,
        phone: input.phone,
      },
      select: CREW_SELECT,
    })

    return (await this.memberRows([created]))[0]
  }

  /**
   * Profile update.
   *
   * The two unique columns are re-checked only when they actually move, so saving an
   * unchanged profile does not collide with the crew member's own row.
   */
  async updateCrew(crewId: string, input: CrewProfileInput): Promise<CrewMemberRow> {
    const current = await this.db.crew.findFirst({ where: { id: crewId, deleted_at: null }, select: CREW_SELECT })
    if (!current) throw new NotFoundException(`Crew ${crewId} was not found`)

    if (current.employee_number !== input.employeeNo) await this.assertEmployeeNoFree(input.employeeNo, crewId)
    if (current.licence_number !== input.licenceNumber) await this.assertLicenceNumberFree(input.licenceNumber, crewId)
    await this.assertBaseActive(input.base)
    const fleet = await this.resolveFleet(input.fleet)

    const updated = await this.db.crew.update({
      where: { id: crewId },
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        employee_number: input.employeeNo,
        role: input.role,
        base_airport: input.base,
        fleet_aircraft_type: fleet,
        languages: input.languages,
        licence_number: input.licenceNumber,
        licence_expires_on: new Date(input.licenceExpiresOn),
        date_of_birth: input.dateOfBirth === null ? null : new Date(input.dateOfBirth),
        email: input.email,
        phone: input.phone,
        updated_at: new Date(),
      },
      select: CREW_SELECT,
    })

    return (await this.memberRows([updated]))[0]
  }

  async addCertification(crewId: string, input: CertificationInput): Promise<CertificationRow> {
    await this.assertCrewExists(crewId)
    const aircraftType = await this.resolveCertificationType(input.aircraftType)
    return this.writeCertification(crewId, { name: input.name, aircraft_type: aircraftType }, input.expiresOn)
  }

  async updateCertification(crewId: string, certificationId: string, input: CertificationInput): Promise<CertificationRow> {
    await this.assertCertificationBelongsToCrew(crewId, certificationId)
    const aircraftType = await this.resolveCertificationType(input.aircraftType)
    await this.mapDuplicateCertification(() =>
      this.db.crew_certification.update({
        where: { id: certificationId },
        data: { name: input.name, aircraft_type: aircraftType, expires_on: new Date(input.expiresOn) },
      }),
    )
    return this.readCertification(certificationId)
  }

  /** Hard delete — a certification is a fact about the crew member, not a soft-deleted row. */
  async removeCertification(crewId: string, certificationId: string): Promise<void> {
    await this.assertCertificationBelongsToCrew(crewId, certificationId)
    await this.db.crew_certification.delete({ where: { id: certificationId } })
  }

  private async assertCrewExists(crewId: string): Promise<void> {
    const found = await this.db.crew.findFirst({ where: { id: crewId, deleted_at: null }, select: { id: true } })
    if (!found) throw new NotFoundException(`Crew ${crewId} was not found`)
  }

  private async assertEmployeeNoFree(employeeNo: string, exceptCrewId?: string): Promise<void> {
    const clash = await this.db.crew.findFirst({
      where: { employee_number: employeeNo, deleted_at: null, ...(exceptCrewId ? { NOT: { id: exceptCrewId } } : {}) },
      select: { id: true },
    })
    if (clash) throw new BadRequestException(`Employee number ${employeeNo} is already in use`)
  }

  private async assertLicenceNumberFree(licenceNumber: string, exceptCrewId?: string): Promise<void> {
    const clash = await this.db.crew.findFirst({
      where: { licence_number: licenceNumber, deleted_at: null, ...(exceptCrewId ? { NOT: { id: exceptCrewId } } : {}) },
      select: { id: true },
    })
    if (clash) throw new BadRequestException(`Licence number ${licenceNumber} is already in use`)
  }

  private async assertCertificationBelongsToCrew(crewId: string, certificationId: string): Promise<void> {
    const found = await this.db.crew_certification.findFirst({ where: { id: certificationId, crew_id: crewId }, select: { id: true } })
    if (!found) throw new NotFoundException(`Certification ${certificationId} does not belong to crew ${crewId}`)
  }

  private async writeCertification(
    crewId: string,
    data: { name: string; aircraft_type: string | null },
    expiresOn: string,
  ): Promise<CertificationRow> {
    const created = await this.mapDuplicateCertification(() =>
      this.db.crew_certification.create({
        data: { crew_id: crewId, name: data.name, aircraft_type: data.aircraft_type, expires_on: new Date(expiresOn) },
        select: { id: true, name: true, aircraft_type: true, expires_on: true },
      }),
    )
    return { id: created.id, name: created.name, aircraftType: created.aircraft_type, expiresOn: localDate(created.expires_on) as string }
  }

  private async readCertification(certificationId: string): Promise<CertificationRow> {
    const row = await this.db.crew_certification.findUnique({
      where: { id: certificationId },
      select: { id: true, name: true, aircraft_type: true, expires_on: true },
    })
    if (!row) throw new NotFoundException(`Certification ${certificationId} was not found`)
    return { id: row.id, name: row.name, aircraftType: row.aircraft_type, expiresOn: localDate(row.expires_on) as string }
  }

  /** A crew member's base has to be an active airport, or the foreign key answers with a 500. */
  private async assertBaseActive(base: string): Promise<void> {
    const found = await this.db.airport.findFirst({ where: { iata_code: base, is_active: true }, select: { iata_code: true } })
    if (!found) throw new BadRequestException(`${base} is not an active base airport`)
  }

  /** The stored model for a fleet the operator typed, matched without regard to case. */
  private async resolveFleet(fleet: string): Promise<string> {
    const models = await this.db.aircraft_type.findMany({ where: { is_active: true }, select: { model: true }, distinct: ['model'] })
    const match = models.find((row) => row.model.toLowerCase() === fleet.toLowerCase())
    if (!match) throw new BadRequestException(`${fleet} is not an active aircraft type`)
    return match.model
  }

  /** A type rating names a model; a certification such as CRM names none. */
  private async resolveCertificationType(aircraftType: string | null): Promise<string | null> {
    return aircraftType === null ? null : this.resolveFleet(aircraftType)
  }

  /** `crew_certification_uq` allows one row per crew member, name and aircraft type. */
  private async mapDuplicateCertification<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This crew member already holds that certification')
      }
      throw error
    }
  }

  /** Days before expiry a licence or certification shows as expiring soon. Falls back to 30 if the setting is missing. */
  private async getExpiryWarningDays(): Promise<number> {
    const setting = await this.db.crew_setting.findUnique({ where: { key: 'expiry_warning_days' }, select: { value: true } })
    const parsed = setting === null ? Number.NaN : Number.parseInt(String(setting.value), 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30
  }

  /**
   * Legal flight-hour cap for the rolling window.
   *
   * Lives in `crew_setting` under the key the F8 design names. A missing key is not an
   * error: the directory still has to render, so the doc's default of 100 is used.
   */
  private async getFlightHoursCap(): Promise<number> {
    const setting = await this.db.crew_setting.findUnique({ where: { key: 'max_flight_hours_28d' }, select: { value: true } })
    const parsed = setting === null ? Number.NaN : Number.parseFloat(String(setting?.value))
    return Number.isFinite(parsed) ? parsed : 100
  }

  /**
   * Upcoming flights for every crew member asked about, in one read.
   *
   * Times are on the wall clock of the airport they happen at: a departure at the origin's, an
   * arrival at the destination's.
   */
  private async dutiesByCrew(crewIds: string[]): Promise<Map<string, UpcomingDutyRow[]>> {
    const duties = new Map<string, UpcomingDutyRow[]>()
    if (crewIds.length === 0) return duties

    const rows = await this.db.pairing_leg_assignment.findMany({
      where: { crew_id: { in: crewIds }, unassigned_at: null, pairing_leg: { flight: { scheduled_dep_at: { gte: new Date() } } } },
      select: {
        crew_id: true,
        pairing_leg_id: true,
        pairing_leg: {
          select: {
            pairing: { select: { code: true, roster_run_pairing: { select: { roster_run: { select: { status: true } } } } } },
            flight: {
              select: {
                flight_number: true,
                service_date: true,
                scheduled_dep_at: true,
                scheduled_arr_at: true,
                route: {
                  select: {
                    origin: true,
                    destination: true,
                    airport_route_originToairport: { select: { timezone: true } },
                    airport_route_destinationToairport: { select: { timezone: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { pairing_leg: { flight: { scheduled_dep_at: 'asc' } } },
    })

    for (const row of rows) {
      const { pairing, flight } = row.pairing_leg
      const duty: UpcomingDutyRow = {
        id: row.pairing_leg_id,
        date: localDate(flight.service_date) as string,
        flightNumber: flight.flight_number,
        origin: flight.route.origin,
        destination: flight.route.destination,
        departureLocal: localTime(flight.scheduled_dep_at, flight.route.airport_route_originToairport.timezone),
        arrivalLocal: localTime(flight.scheduled_arr_at, flight.route.airport_route_destinationToairport.timezone),
        pairingId: pairing.code,
        rosterStatus: pairing.roster_run_pairing?.roster_run.status === 'published' ? 'Published' : 'Draft',
      }
      duties.set(row.crew_id, [...(duties.get(row.crew_id) ?? []), duty])
    }
    return duties
  }

  /**
   * Block hours flown in the rolling window, summed across every leg still assigned, for
   * everyone asked about in one read. Only flights that have already left count: a duty
   * next week is not hours flown, and would push someone over the cap on paper.
   */
  private async hoursByCrew(crewIds: string[]): Promise<Map<string, number>> {
    const hours = new Map<string, number>()
    if (crewIds.length === 0) return hours

    const now = new Date()
    const since = new Date(now.getTime() - HOURS_WINDOW_DAYS * 86_400_000)
    const rows = await this.db.pairing_leg_assignment.findMany({
      where: { crew_id: { in: crewIds }, unassigned_at: null, pairing_leg: { flight: { scheduled_dep_at: { gte: since, lte: now } } } },
      select: { crew_id: true, pairing_leg: { select: { flight: { select: { scheduled_dep_at: true, scheduled_arr_at: true } } } } },
    })

    for (const row of rows) {
      const { scheduled_dep_at, scheduled_arr_at } = row.pairing_leg.flight
      hours.set(row.crew_id, (hours.get(row.crew_id) ?? 0) + hoursBetween(scheduled_dep_at, scheduled_arr_at))
    }
    for (const [crewId, total] of hours) hours.set(crewId, Math.round(total * 10) / 10)
    return hours
  }

  /** Turns crew rows into what the page shows, with one read for the cap, one for hours and one for duties however many there are. */
  private async memberRows(rows: CrewDbRow[]): Promise<CrewMemberRow[]> {
    const ids = rows.map((row) => row.id)
    const [hoursCap, hours, duties] = await Promise.all([this.getFlightHoursCap(), this.hoursByCrew(ids), this.dutiesByCrew(ids)])
    return rows.map((row) => this.toMemberRow(row, hoursCap, hours.get(row.id) ?? 0, duties.get(row.id) ?? []))
  }

  private toMemberRow(row: CrewDbRow, hoursCap: number, hours28d: number, upcomingDuties: UpcomingDutyRow[]): CrewMemberRow {
    const role = CREW_ROLES.includes(row.role as CrewRole) ? (row.role as CrewRole) : 'cabin_crew'
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      employeeNo: row.employee_number,
      role,
      roleLabel: CREW_ROLE_LABEL[role],
      base: row.base_airport,
      baseCountry: countryName(row.airport.country),
      fleet: row.fleet_aircraft_type,
      languages: row.languages,
      dateOfBirth: localDate(row.date_of_birth),
      email: row.email,
      phone: row.phone,
      licenceNumber: row.licence_number,
      licenceExpiresOn: localDate(row.licence_expires_on) as string,
      hours28d,
      hoursCap,
      certifications: row.crew_certification
        .map((cert) => ({
          id: cert.id,
          name: cert.name,
          aircraftType: cert.aircraft_type,
          expiresOn: localDate(cert.expires_on) as string,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      upcomingDuties,
    }
  }
}
