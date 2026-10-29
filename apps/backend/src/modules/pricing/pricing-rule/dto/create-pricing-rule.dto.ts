import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator'
import { RULE_GROUPS, type RuleGroup } from '../../pricing.constants'

const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

// Field-level limits only. Which condition columns a group may use, and min <= max, are checked by the service on the
// whole row, because they depend on other fields (and, on update, on the stored row).
export class CreatePricingRuleDto {
  @IsIn(RULE_GROUPS)
  rule_group!: RuleGroup

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string // copied onto the quote line, e.g. 'H-7'

  // Omit to add the rule at the end of its group.
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  min_days_out?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  max_days_out?: number | null

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  min_seats_left_pct?: number | null

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  max_seats_left_pct?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number | null

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'start_date must be YYYY-MM-DD' })
  start_date?: string | null

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'end_date must be YYYY-MM-DD' })
  end_date?: string | null

  // null or omitted = applies to every fare class
  @IsOptional()
  @IsUUID()
  fare_class_id?: string | null

  // +15 = +15%. Above -100 so a rule can never make the fare free or negative; NUMERIC(6,2) caps it at 9999.99.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-99.99)
  @Max(9999.99)
  adjustment_pct!: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
