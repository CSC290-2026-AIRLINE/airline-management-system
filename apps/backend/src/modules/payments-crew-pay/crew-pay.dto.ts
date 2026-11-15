import { Type } from 'class-transformer'
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator'

export class CreatePayRunDto {
  @IsDateString({ strict: true })
  period_start!: string

  @IsDateString({ strict: true })
  period_end!: string
}

export class ApprovePayRunDto {
  /** Required when the run needs an admin (above the override limit or with an adjustment). */
  @IsOptional()
  @IsString()
  @Length(3, 500)
  note?: string
}

export class AdjustmentDto {
  @IsUUID()
  crew_id!: string

  /** Positive or negative, never zero. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-99_999)
  @Max(99_999)
  amount!: number

  @IsString()
  @Length(3, 300)
  description!: string

  @IsOptional()
  @IsDateString({ strict: true })
  earned_on?: string

  @IsOptional()
  @IsUUID()
  pairing_id?: string

  /** A draft run to add it to; without it the adjustment waits for the next run. */
  @IsOptional()
  @IsUUID()
  pay_run_id?: string
}
