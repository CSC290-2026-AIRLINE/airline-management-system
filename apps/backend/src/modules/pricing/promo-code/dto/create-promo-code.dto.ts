import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator'
import { PROMO_KINDS, type PromoKind } from '../../pricing.constants'

// Timestamps need an explicit timezone (Z or +07:00): without one the moment would depend on the server's clock.
const HAS_TIMEZONE = /(Z|[+-]\d{2}:\d{2})$/

// Field-level limits only. "Exactly one discount", valid_from < valid_to and max_uses >= used_count are checked by the
// service on the whole row, because on update they depend on the stored values. used_count is never sent: the
// ValidationPipe refuses it, and only redeem changes it.
export class CreatePromoCodeDto {
  @Matches(/^[A-Z0-9_]{1,20}$/, { message: 'code must be 1-20 uppercase letters, digits or _' })
  code!: string

  @IsIn(PROMO_KINDS)
  kind!: PromoKind

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  discount_pct?: number | null

  // A fixed amount off, in the base currency. NUMERIC(12,2) caps it.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  discount_amount?: number | null

  @IsISO8601({ strict: true })
  @Matches(HAS_TIMEZONE, { message: 'valid_from must include a timezone, e.g. 2026-11-01T00:00:00+07:00' })
  valid_from!: string

  @IsISO8601({ strict: true })
  @Matches(HAS_TIMEZONE, { message: 'valid_to must include a timezone, e.g. 2026-12-01T00:00:00+07:00' })
  valid_to!: string

  // null or omitted = unlimited
  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses?: number | null

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
