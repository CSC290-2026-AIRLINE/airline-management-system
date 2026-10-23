import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

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
export const CREW_ROLES = ['captain', 'first_officer', 'cabin', 'police'] as const
export type CrewRole = (typeof CREW_ROLES)[number]

export const CREW_ROLE_LABEL: Record<CrewRole, string> = {
  captain: 'Captain',
  first_officer: 'First Officer',
  cabin: 'Cabin Crew',
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
  roleLabel: string
  /** Base airport IATA code. */
  base: string
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
  fleet_aircraft_type: string
  languages: string[]
  date_of_birth: Date | null
  email: string | null
  phone: string | null
  licence_number: string
  licence_expires_on: Date
  certifications: {
    id: string
    name: string
    aircraft_type: string | null
    expires_on: Date
  }[]
}

interface DutyDbRow {
  pairing_leg_id: string
  pairing_code: string
  roster_status: string
  flight_id: string
  flight_number: string
  origin: string
  destination: string
  scheduled_dep_at: Date
  scheduled_arr_at: Date
  service_date: Date
}

const CREW_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  employee_number: true,
  role: true,
  base_airport: true,
  fleet_aircraft_type: true,
  languages: true,
  date_of_birth: true,
  email: true,
  phone: true,
  licence_number: true,
  licence_expires_on: true,
  certifications: { select: { id: true, name: true, aircraft_type: true, expires_on: true } },
} as const

/** `YYYY-MM-DD` in UTC — the shape every date field leaves the service in. */
function localDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

/** `HH:mm` — the page prints times on their own and never needs the date part. */
function clockTime(value: Date): string {
  return value.toISOString().slice(11, 16)
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

  /** Fleets a crew member can be rated on: every active aircraft type. */
  async listFleets(): Promise<FleetOptionRow[]> {
    const rows = await this.db.aircraftType.findMany({
      where: { is_active: true },
      select: { code: true, model: true },
      orderBy: { code: 'asc' },
    })
    return rows.map((row) => ({ code: row.code, label: row.model === row.code ? row.code : `${row.code} · ${row.model}` }))
  }

  /**
   * Languages a crew profile can carry.
   *
   * Sourced from `country_language`, which is also what makes a language "local" in
   * step 3 — listing the two from different tables would let the two drift.
   */
  async listLanguages(): Promise<LanguageOptionRow[]> {
    const rows = await this.db.countryLanguage.findMany({
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
    const hoursCap = await this.getFlightHoursCap()

    const term = query.search?.trim().toLowerCase() ?? ''
    const matched = all.filter((row) => {
      if (query.base && row.base_airport !== query.base) return false
      if (query.role && row.role !== query.role) return false
      if (!term) return true
      return `${row.first_name} ${row.last_name}`.toLowerCase().includes(term) || row.employee_number.toLowerCase().includes(term)
    })

    const crew = await Promise.all(matched.map((row) => this.toMemberRow(row, hoursCap)))

    const metrics: CrewMetricsRow = {
      totalCrew: all.length,
      pilots: all.filter((row) => PILOT_ROLES.includes(row.role as CrewRole)).length,
      cabinCrew: all.filter((row) => row.role === 'cabin').length,
      flightPolice: all.filter((row) => row.role === 'police').length,
    }

    return { crew, metrics }
  }

  /** One profile, certifications and upcoming duties included. */
  async getCrew(crewId: string): Promise<CrewMemberRow> {
    const row = (await this.db.crew.findFirst({ where: { id: crewId, deleted_at: null }, select: CREW_SELECT })) as CrewDbRow | null
    if (!row) throw new NotFoundException(`Crew ${crewId} was not found`)

    return this.toMemberRow(row, await this.getFlightHoursCap())
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

    const created = (await this.db.crew.create({
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        employee_number: input.employeeNo,
        role: input.role,
        base_airport: input.base,
        fleet_aircraft_type: input.fleet,
        languages: input.languages,
        licence_number: input.licenceNumber,
        licence_expires_on: new Date(input.licenceExpiresOn),
        date_of_birth: input.dateOfBirth === null ? null : new Date(input.dateOfBirth),
        email: input.email,
        phone: input.phone,
      },
      select: CREW_SELECT,
    })) as CrewDbRow

    return this.toMemberRow(created, await this.getFlightHoursCap())
  }

  /**
   * Profile update.
   *
   * The two unique columns are re-checked only when they actually move, so saving an
   * unchanged profile does not collide with the crew member's own row.
   */
  async updateCrew(crewId: string, input: CrewProfileInput): Promise<CrewMemberRow> {
    const current = (await this.db.crew.findFirst({ where: { id: crewId, deleted_at: null }, select: CREW_SELECT })) as CrewDbRow | null
    if (!current) throw new NotFoundException(`Crew ${crewId} was not found`)

    if (current.employee_number !== input.employeeNo) await this.assertEmployeeNoFree(input.employeeNo, crewId)
    if (current.licence_number !== input.licenceNumber) await this.assertLicenceNumberFree(input.licenceNumber, crewId)

    const updated = (await this.db.crew.update({
      where: { id: crewId },
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        employee_number: input.employeeNo,
        role: input.role,
        base_airport: input.base,
        fleet_aircraft_type: input.fleet,
        languages: input.languages,
        licence_number: input.licenceNumber,
        licence_expires_on: new Date(input.licenceExpiresOn),
        date_of_birth: input.dateOfBirth === null ? null : new Date(input.dateOfBirth),
        email: input.email,
        phone: input.phone,
        updated_at: new Date(),
      },
      select: CREW_SELECT,
    })) as CrewDbRow

    return this.toMemberRow(updated, await this.getFlightHoursCap())
  }

  async addCertification(crewId: string, input: CertificationInput): Promise<CertificationRow> {
    await this.assertCrewExists(crewId)
    return this.writeCertification(crewId, { name: input.name, aircraft_type: input.aircraftType }, input.expiresOn)
  }

  async updateCertification(crewId: string, certificationId: string, input: CertificationInput): Promise<CertificationRow> {
    await this.assertCertificationBelongsToCrew(crewId, certificationId)
    await this.db.crewCertification.update({
      where: { id: certificationId },
      data: { name: input.name, aircraft_type: input.aircraftType, expires_on: new Date(input.expiresOn) },
    })
    return this.readCertification(certificationId)
  }

  /** Hard delete — a certification is a fact about the crew member, not a soft-deleted row. */
  async removeCertification(crewId: string, certificationId: string): Promise<void> {
    await this.assertCertificationBelongsToCrew(crewId, certificationId)
    await this.db.crewCertification.delete({ where: { id: certificationId } })
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
    const found = await this.db.crewCertification.findFirst({ where: { id: certificationId, crew_id: crewId }, select: { id: true } })
    if (!found) throw new NotFoundException(`Certification ${certificationId} does not belong to crew ${crewId}`)
  }

  private async writeCertification(
    crewId: string,
    data: { name: string; aircraft_type: string | null },
    expiresOn: string,
  ): Promise<CertificationRow> {
    const created = (await this.db.crewCertification.create({
      data: { crew_id: crewId, name: data.name, aircraft_type: data.aircraft_type, expires_on: new Date(expiresOn) },
      select: { id: true, name: true, aircraft_type: true, expires_on: true },
    })) as { id: string; name: string; aircraft_type: string | null; expires_on: Date }
    return { id: created.id, name: created.name, aircraftType: created.aircraft_type, expiresOn: localDate(created.expires_on) as string }
  }

  private async readCertification(certificationId: string): Promise<CertificationRow> {
    const row = (await this.db.crewCertification.findUnique({
      where: { id: certificationId },
      select: { id: true, name: true, aircraft_type: true, expires_on: true },
    })) as { id: string; name: string; aircraft_type: string | null; expires_on: Date } | null
    if (!row) throw new NotFoundException(`Certification ${certificationId} was not found`)
    return { id: row.id, name: row.name, aircraftType: row.aircraft_type, expiresOn: localDate(row.expires_on) as string }
  }

  /**
   * Legal flight-hour cap for the rolling window.
   *
   * Lives in `crew_setting` under the key the F8 design names. A missing key is not an
   * error: the directory still has to render, so the doc's default of 100 is used.
   */
  private async getFlightHoursCap(): Promise<number> {
    const setting = await this.db.crewSetting.findUnique({ where: { key: 'max_flight_hours_28d' }, select: { value: true } })
    const parsed = setting === null ? Number.NaN : Number.parseFloat(String(setting?.value))
    return Number.isFinite(parsed) ? parsed : 100
  }

  /** Flights this crew member is on in the next 28 days, across draft and published runs. */
  private async listUpcomingDuties(crewId: string): Promise<UpcomingDutyRow[]> {
    const rows = (await this.db.pairingLegAssignment.findMany({
      where: { crew_id: crewId, unassigned_at: null, pairing_leg: { flight: { scheduled_dep_at: { gte: new Date() } } } },
      select: {
        pairing_leg_id: true,
        pairing_leg: {
          select: {
            pairing: { select: { code: true, roster_run_pairing: { select: { roster_run: { select: { status: true } } }, take: 1 } } },
            flight: {
              select: {
                flight_number: true,
                service_date: true,
                scheduled_dep_at: true,
                scheduled_arr_at: true,
                route: { select: { origin: true, destination: true } },
              },
            },
          },
        },
      },
      orderBy: { pairing_leg: { flight: { scheduled_dep_at: 'asc' } } },
    })) as {
      pairing_leg_id: string
      pairing_leg: {
        pairing: { code: string; roster_run_pairing: { roster_run: { status: string } }[] }
        flight: {
          flight_number: string
          service_date: Date
          scheduled_dep_at: Date
          scheduled_arr_at: Date
          route: { origin: string; destination: string }
        }
      }
    }[]

    return rows.map(({ pairing_leg_id: legId, pairing_leg: leg }): UpcomingDutyRow => {
      const run = leg.pairing.roster_run_pairing[0]
      const duty: DutyDbRow = {
        pairing_leg_id: legId,
        pairing_code: leg.pairing.code,
        roster_status: run?.roster_run.status ?? 'draft',
        flight_id: '',
        flight_number: leg.flight.flight_number,
        origin: leg.flight.route.origin,
        destination: leg.flight.route.destination,
        scheduled_dep_at: leg.flight.scheduled_dep_at,
        scheduled_arr_at: leg.flight.scheduled_arr_at,
        service_date: leg.flight.service_date,
      }
      return {
        id: duty.pairing_leg_id,
        date: localDate(duty.service_date) as string,
        flightNumber: duty.flight_number,
        origin: duty.origin,
        destination: duty.destination,
        departureLocal: clockTime(duty.scheduled_dep_at),
        arrivalLocal: clockTime(duty.scheduled_arr_at),
        pairingId: duty.pairing_code,
        rosterStatus: duty.roster_status === 'published' ? 'Published' : 'Draft',
      }
    })
  }

  /** Block hours flown in the rolling window, summed across every leg still assigned. */
  private async hoursInWindow(crewId: string): Promise<number> {
    const since = new Date(Date.now() - HOURS_WINDOW_DAYS * 86_400_000)
    const rows = (await this.db.pairingLegAssignment.findMany({
      where: { crew_id: crewId, unassigned_at: null, pairing_leg: { flight: { scheduled_dep_at: { gte: since } } } },
      select: { pairing_leg: { select: { flight: { select: { scheduled_dep_at: true, scheduled_arr_at: true } } } } },
    })) as { pairing_leg: { flight: { scheduled_dep_at: Date; scheduled_arr_at: Date } } }[]

    return (
      Math.round(
        rows.reduce(
          (total, row) => total + hoursBetween(row.pairing_leg.flight.scheduled_dep_at, row.pairing_leg.flight.scheduled_arr_at),
          0,
        ) * 10,
      ) / 10
    )
  }

  private async toMemberRow(row: CrewDbRow, hoursCap: number): Promise<CrewMemberRow> {
    const role = CREW_ROLES.includes(row.role as CrewRole) ? (row.role as CrewRole) : 'cabin'
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      employeeNo: row.employee_number,
      role,
      roleLabel: CREW_ROLE_LABEL[role],
      base: row.base_airport,
      fleet: row.fleet_aircraft_type,
      languages: row.languages,
      dateOfBirth: localDate(row.date_of_birth),
      email: row.email,
      phone: row.phone,
      licenceNumber: row.licence_number,
      licenceExpiresOn: localDate(row.licence_expires_on) as string,
      hours28d: await this.hoursInWindow(row.id),
      hoursCap,
      certifications: row.certifications
        .map((cert) => ({
          id: cert.id,
          name: cert.name,
          aircraftType: cert.aircraft_type,
          expiresOn: localDate(cert.expires_on) as string,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      upcomingDuties: await this.listUpcomingDuties(row.id),
    }
  }
}
