import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

const SETTING_KEYS = ['holding_limit_minutes', 'airline_code', 'approval_mode', 'approval_response_delay_minutes']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// The Feature 2 settings kept in flight_setting. A value that was never saved reads as null.
@Injectable()
export class SettingsService {
  constructor(private readonly db: DbService) {}

  async get() {
    const rows = await this.db.flight_setting.findMany()
    const value = (key: string) => rows.find((r) => r.key === key)?.value
    const holding = value('holding_limit_minutes')
    const delay = value('approval_response_delay_minutes')
    return {
      holding_limit_minutes: holding === undefined ? null : Number(holding),
      airline_code: value('airline_code') ?? null,
      approval_mode: value('approval_mode') ?? 'auto',
      approval_response_delay_minutes: delay === undefined ? 0 : Number(delay),
    }
  }

  // One key from PUT flight-settings/:key, with the value in `{ value }`. A numeric key also takes its number as text.
  updateOne(key: string, body: unknown) {
    if (!SETTING_KEYS.includes(key)) throw new NotFoundException(`unknown setting ${key}`)
    const raw = isObject(body) ? body.value : undefined
    const numeric = key === 'holding_limit_minutes' || key === 'approval_response_delay_minutes'
    const value = numeric && typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
    return this.update({ [key]: value })
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
    if (body.approval_mode !== undefined) {
      const v = body.approval_mode
      if (v !== 'auto' && v !== 'manual') errors.push('approval_mode must be auto or manual')
      else saves.push({ key: 'approval_mode', value: v })
    }
    if (body.approval_response_delay_minutes !== undefined) {
      const v = body.approval_response_delay_minutes
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
        errors.push('approval_response_delay_minutes must be a whole number of minutes, 0 or more')
      else saves.push({ key: 'approval_response_delay_minutes', value: String(v) })
    }
    if (saves.length === 0 && errors.length === 0) {
      errors.push('send holding_limit_minutes, airline_code, approval_mode or approval_response_delay_minutes')
    }
    if (errors.length) throw new BadRequestException(errors)

    // One transaction, so a request that sends both keys saves both or neither. updated_at is audit metadata, so the real clock is
    // fine. ponytail: updated_by stays empty until staff ids are looked up from the token.
    await this.db.$transaction(
      saves.map(({ key, value }) =>
        this.db.flight_setting.upsert({ where: { key }, create: { key, value }, update: { value, updated_at: new Date() } }),
      ),
    )
    return this.get()
  }
}
