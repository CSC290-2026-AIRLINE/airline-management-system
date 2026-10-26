import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { MAX_QUOTE_HOLD_MINUTES, PRICING_SETTING_DEFAULTS, type PricingSettingKey } from '../pricing.constants'
import { PricingErrorCode, pricingError } from '../pricing.errors'

const SETTING_KEYS = Object.keys(PRICING_SETTING_DEFAULTS) as PricingSettingKey[]

@Injectable()
export class SettingService {
  constructor(private readonly db: DbService) {}

  // Always returns every key; a key the seed has not inserted shows its default with updated_at null.
  async findAll() {
    const rows = await this.db.pricing_setting.findMany()
    return SETTING_KEYS.map(
      (key) => rows.find((row) => row.key === key) ?? { key, value: PRICING_SETTING_DEFAULTS[key], updated_at: null, updated_by: null },
    )
  }

  async update(key: string, value: string, userId: string) {
    if (!isSettingKey(key)) {
      throw new NotFoundException(pricingError(PricingErrorCode.SETTING_NOT_FOUND, `Unknown setting ${key}`))
    }
    // Every stored amount is in the base currency, so changing it would silently re-denominate them. Seed-only.
    if (key === 'base_currency') {
      throw new ConflictException(
        pricingError(PricingErrorCode.SETTING_READ_ONLY, 'base_currency is set by the seed and cannot be changed'),
      )
    }
    if (!/^[1-9]\d*$/.test(value) || Number(value) > MAX_QUOTE_HOLD_MINUTES) {
      throw new BadRequestException(
        pricingError(PricingErrorCode.SETTING_INVALID, `quote_hold_minutes must be a whole number from 1 to ${MAX_QUOTE_HOLD_MINUTES}`),
      )
    }

    const staffId = await this.staffIdFor(userId)
    const data = { value, updated_by: staffId, updated_at: new Date() }
    return this.db.pricing_setting.upsert({ where: { key }, create: { key, ...data }, update: data })
  }

  // For other modules (quotes, Member B's finance). Fall back to the default until the seed inserts the row.
  async getBaseCurrency(): Promise<string> {
    return this.getValue('base_currency')
  }

  async getQuoteHoldMinutes(): Promise<number> {
    return Number(await this.getValue('quote_hold_minutes'))
  }

  private async getValue(key: PricingSettingKey) {
    const row = await this.db.pricing_setting.findUnique({ where: { key } })
    return row?.value ?? PRICING_SETTING_DEFAULTS[key]
  }

  // updated_by references staff.id, but the token carries user.id.
  private async staffIdFor(userId: string) {
    const staff = await this.db.staff.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    if (!staff) {
      throw new ForbiddenException(pricingError(PricingErrorCode.STAFF_NOT_FOUND, 'Only staff can change pricing settings'))
    }
    return staff.id
  }
}

function isSettingKey(key: string): key is PricingSettingKey {
  return (SETTING_KEYS as string[]).includes(key)
}
