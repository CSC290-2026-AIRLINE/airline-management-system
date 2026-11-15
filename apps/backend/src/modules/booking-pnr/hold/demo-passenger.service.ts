import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DbService } from '@backend/db/db.service'
import type { EnvConfig } from '@backend/config/env.validation'
import { BookingError } from '../common/booking-error'
import type { CreateDemoPassengerDto } from './dto/create-demo-passengers.dto'

@Injectable()
export class DemoPassengerService {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private assertDevelopment() {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'development') {
      throw new BookingError('INVALID_BOOKING_STATE', 'Not found', 404)
    }
  }

  async list() {
    this.assertDevelopment()
    // These synthetic passport markers belong to testing/seed-f03.ts, never to customer profiles.
    const rows = await this.db.passenger.findMany({
      where: { passport_number: { in: ['F03SEED001', 'F03SEED002'] }, deleted_at: null },
      select: { id: true, first_name: true, last_name: true, date_of_birth: true, passport_number: true },
      orderBy: { passport_number: 'asc' },
    })
    return rows.flatMap((row) =>
      row.date_of_birth && row.passport_number
        ? [
            {
              id: row.id,
              givenName: row.first_name,
              familyName: row.last_name,
              dateOfBirth: row.date_of_birth.toISOString().slice(0, 10),
              passportNumber: row.passport_number,
            },
          ]
        : [],
    )
  }

  /**
   * The temporary development adapter for the passenger details typed into the booking form: it turns them into
   * passenger records, so a hold can be made before Feature 7 owns passenger profiles. It never runs outside a
   * development environment, and Feature 7's adapter replaces it.
   */
  async create(passengers: CreateDemoPassengerDto[]): Promise<Array<{ id: string }>> {
    this.assertDevelopment()
    const rows = await this.db.$transaction(
      passengers.map((person) => {
        const dateOfBirth = new Date(`${person.dateOfBirth}T00:00:00Z`)
        if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.toISOString().slice(0, 10) !== person.dateOfBirth)
          throw new BookingError('INVALID_BOOKING_STATE', 'Invalid date of birth', 422)
        return this.db.passenger.create({
          data: {
            first_name: person.givenName.trim(),
            last_name: person.familyName.trim(),
            date_of_birth: dateOfBirth,
            passport_number: person.passportNumber.trim(),
          },
        })
      }),
    )
    return rows.map((row) => ({ id: row.id }))
  }
}
