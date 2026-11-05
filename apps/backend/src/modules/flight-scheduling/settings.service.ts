import { BadRequestException, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// The two Feature 2 settings kept in flight_setting. A value that was never saved reads as null.
@Injectable()
export class SettingsService {
  constructor(private readonly db: DbService) {}

  async get() {
    const rows = await this.db.flight_setting.findMany()
    const value = (key: string) => rows.find((r) => r.key === key)?.value
    const holding = value('holding_limit_minutes')
    return { holding_limit_minutes: holding === undefined ? null : Number(holding), airline_code: value('airline_code') ?? null }
  }

  // Saves the keys that are present in the body, so a form can send both or one.
  async update(body: unknown) {
    if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
    const errors: string[] = []
    const saves: { key: string; value: string }[] = []

    if (body.holding_limit_minutes !== undefined) {
      const v = body.holding_limit_minutes
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) errors.push('holding_limit_minutes must be a whole number of minutes')
      else saves.push({ key: 'holding_limit_minutes', value: String(v) })
    }
    if (body.airline_code !== undefined) {
      const v = body.airline_code
      if (typeof v !== 'string' || !/^[A-Za-z0-9]{2}$/.test(v.trim())) errors.push('airline_code must be two letters or digits')
      else saves.push({ key: 'airline_code', value: v.trim().toUpperCase() })
    }
    if (saves.length === 0 && errors.length === 0) errors.push('send holding_limit_minutes or airline_code')
    if (errors.length) throw new BadRequestException(errors)

    // updated_at is audit metadata, so the real clock is fine. ponytail: updated_by stays empty until staff ids are looked up from the token.
    for (const { key, value } of saves) {
      await this.db.flight_setting.upsert({ where: { key }, create: { key, value }, update: { value, updated_at: new Date() } })
    }
    return this.get()
  }
}
