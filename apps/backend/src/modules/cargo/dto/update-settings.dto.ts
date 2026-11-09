import { IsNumber, IsPositive, IsString } from 'class-validator'
import { Type } from 'class-transformer'

const VALID_KEYS = [
  'volumetric_kg_per_m3',
  'baggage_reserve_kg_per_passenger',
  'baggage_reserve_floor_percent',
  'booking_cutoff_hours',
  'hold_minutes',
  'weight_tolerance_percent',
  'claim_window_days',
  'request_window_days',
] as const

export type SettingKey = (typeof VALID_KEYS)[number]

export const SETTING_KEYS: ReadonlySet<string> = new Set(VALID_KEYS)

class SettingEntryDto {
  @IsString()
  key: string

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  value: number
}

export class UpdateSettingsDto {
  @Type(() => SettingEntryDto)
  settings: SettingEntryDto[]
}
