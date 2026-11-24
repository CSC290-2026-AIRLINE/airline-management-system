import { Transform } from 'class-transformer'
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * Body of `POST /api/dev/payments`: a stand-in for the selling feature that would start a card payment.
 */
export class CreateDevPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5000)
  amount!: number

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  description?: string

  /** How long the payment can be paid for, in minutes. Defaults to 25. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  hold_minutes?: number
}
