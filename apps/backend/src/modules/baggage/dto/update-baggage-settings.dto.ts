import { IsInt, Max, Min } from 'class-validator'

/**
 * Provisional, project-approved bounds (not spec limits). The spec only sets the defaults: 21 and 90 days.
 * unclaimed_after_days stays at least UNCLAIMED_WARNING_DAYS (7) so the "unclaimed soon" staff warning stays meaningful.
 */
export const LOST_AFTER_DAYS_RANGE = { min: 1, max: 365 } as const
export const UNCLAIMED_AFTER_DAYS_RANGE = { min: 7, max: 3650 } as const

/** Body of `PUT /api/staff/baggage-settings`: a full replacement, so both values are required. */
export class UpdateBaggageSettingsDto {
  @IsInt()
  @Min(LOST_AFTER_DAYS_RANGE.min)
  @Max(LOST_AFTER_DAYS_RANGE.max)
  lostAfterDays: number

  @IsInt()
  @Min(UNCLAIMED_AFTER_DAYS_RANGE.min)
  @Max(UNCLAIMED_AFTER_DAYS_RANGE.max)
  unclaimedAfterDays: number
}
