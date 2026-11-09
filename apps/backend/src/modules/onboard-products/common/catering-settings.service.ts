// CateringSettingsService: the two key/value settings F12 reads from
// the database.
//
//   catering_setting 'payment_hold_minutes' — how long an unpaid order
//   holds its stock before it expires (default 30).
//   pricing_setting  'base_currency'          — the currency F4 prices
//   in; orders and sales keep a snapshot of it.
//
// Both live in key/value tables owned by other teams, so F12 only
// reads them.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'

@Injectable()
export class CateringSettingsService {
  constructor(private readonly db: DbService) {}

  async paymentHoldMinutes(): Promise<number> {
    const row = await this.db.catering_setting.findUnique({ where: { key: 'payment_hold_minutes' } })
    const minutes = row ? Number(row.value) : Number.NaN
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 30
  }

  async baseCurrency(): Promise<string> {
    const row = await this.db.pricing_setting.findUnique({ where: { key: 'base_currency' } })
    const value = row?.value?.trim()
    return value && value.length > 0 ? value.toUpperCase() : 'USD'
  }
}
