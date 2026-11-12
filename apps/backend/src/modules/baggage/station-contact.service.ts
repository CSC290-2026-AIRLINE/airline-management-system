import { Injectable } from '@nestjs/common'
import type { station_contact } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { AIRPORT_CODE_PATTERN, UUID_PATTERN, prismaErrorCode } from './common/patterns'
import { formatPhoneNumber, phoneNumberProblem } from './common/phone-number'

/** The baggage desk at an airport, so staff can call the station holding a bag. */
export interface StationContact {
  airportCode: string
  airportName: string
  city: string
  deskName: string
  phone: string
  email: string | null
  updatedAt: Date
  updatedBy: string | null
}

export interface SaveStationContactInput {
  staffId: string
  airportCode: string
  deskName: string
  phone: string
  email?: string | null
}

const WITH_AIRPORT = { airport: { select: { name: true, city: true } } } as const

type StationContactRow = station_contact & { airport: { name: string; city: string } }

function toContact(row: StationContactRow): StationContact {
  return {
    airportCode: row.airport_code,
    airportName: row.airport.name,
    city: row.airport.city,
    deskName: row.desk_name,
    phone: row.phone,
    email: row.email,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

function notFound(airportCode: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.STATION_CONTACT_NOT_FOUND, `No baggage desk contact for ${airportCode}`)
}

function invalid(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_STATION_CONTACT, message)
}

@Injectable()
export class StationContactService {
  constructor(private readonly db: DbService) {}

  async list(): Promise<StationContact[]> {
    const rows = await this.db.station_contact.findMany({ include: WITH_AIRPORT, orderBy: { airport_code: 'asc' } })

    return rows.map(toContact)
  }

  async get(airportCode: string): Promise<StationContact> {
    const code = airportCode?.trim().toUpperCase()
    const row =
      code && AIRPORT_CODE_PATTERN.test(code)
        ? await this.db.station_contact.findUnique({ where: { airport_code: code }, include: WITH_AIRPORT })
        : null

    if (!row) {
      throw notFound(code || airportCode)
    }

    return toContact(row)
  }

  /** Create or replace the desk contact of one airport. updated_at is set by the backend (no trigger). */
  async save(input: SaveStationContactInput): Promise<StationContact> {
    const airportCode = input.airportCode?.trim().toUpperCase()
    const deskName = input.deskName?.trim()
    const phone = input.phone?.trim()
    const email = input.email?.trim() || null

    if (!input.staffId || !UUID_PATTERN.test(input.staffId)) {
      throw invalid('Recording staff member is required')
    }

    if (!airportCode || !AIRPORT_CODE_PATTERN.test(airportCode)) {
      throw invalid('Airport must be a 3-letter IATA code')
    }

    if (!deskName || !phone) {
      throw invalid('Desk name and phone are required')
    }

    const storedPhone = formatPhoneNumber(phone)

    if (!storedPhone) {
      throw invalid(phoneNumberProblem(phone) ?? 'Check the phone number.')
    }

    const data = { desk_name: deskName, phone: storedPhone, email, updated_at: new Date(), updated_by: input.staffId }

    try {
      const row = await this.db.station_contact.upsert({
        where: { airport_code: airportCode },
        create: { airport_code: airportCode, ...data },
        update: data,
        include: WITH_AIRPORT,
      })

      return toContact(row)
    } catch (e) {
      // Foreign key: the airport is not in Feature 2's airport table.
      if (prismaErrorCode(e) === 'P2003') {
        throw invalid(`Unknown airport ${airportCode}`)
      }

      throw e
    }
  }
}
