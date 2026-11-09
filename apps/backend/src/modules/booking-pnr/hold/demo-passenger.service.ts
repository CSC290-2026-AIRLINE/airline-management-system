import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DbService } from '@backend/db/db.service'
import type { EnvConfig } from '@backend/config/env.validation'
import { BookingError } from '../common/booking-error'

@Injectable()
export class DemoPassengerService {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async list() {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'development') {
      throw new BookingError('INVALID_BOOKING_STATE', 'Not found', 404)
    }
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
}
