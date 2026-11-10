import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DbService } from '@backend/db/db.service'
import type { EnvConfig } from '@backend/config/env.validation'
import { BookingError } from '../common/booking-error'

@Injectable()
export class DemoBookingCustomerService {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async list(userId: string) {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'development') throw new BookingError('INVALID_BOOKING_STATE', 'Not found', 404)
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true },
    })
    if (!staff) throw new BookingError('INVALID_BOOKING_STATE', 'An active staff account is required', 403)
    const rows = await this.db.customer.findMany({
      where: { deleted_at: null, user: { clerk_user_id: 'f03-seed-customer', type: 'customer', disabled_at: null, deleted_at: null } },
      select: { id: true, phone: true, passenger: { select: { first_name: true, last_name: true } }, user: { select: { email: true } } },
    })
    return rows.map((row) => ({
      id: row.id,
      name: `${row.passenger.first_name} ${row.passenger.last_name}`,
      email: row.user.email,
      phone: row.phone ?? '',
    }))
  }
}
