import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import type { Insurance, TransactionType } from '../domain/types'

const TRANSACTION_TYPES: TransactionType[] = ['earn', 'redeem', 'redeem_reversal', 'expire', 'adjust']

/** `GET /loyalty/members/me/transactions?type=&from=&to=`. `from` and `to` are dates or timestamps; `to` is inclusive. */
export class StatementQueryDto {
  @IsOptional()
  @IsIn(TRANSACTION_TYPES)
  type?: TransactionType

  @IsOptional()
  @IsDateString()
  from?: string

  @IsOptional()
  @IsDateString()
  to?: string
}

/** `GET /staff/loyalty/members?q=`: member number, name or email. Empty lists the newest members. */
export class MemberSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string
}

/** `POST /staff/loyalty/members/:id/adjustments`. */
export class AdjustmentDto {
  @IsInt()
  @Min(-10_000_000)
  @Max(10_000_000)
  miles!: number

  @IsString()
  @Matches(/\S/, { message: 'A reason is required.' })
  @MaxLength(500)
  reason!: string
}

/** `PUT /staff/loyalty/tier-rules/:code`. */
export class TierRuleDto {
  @IsInt()
  @Min(1)
  minMiles!: number

  @IsInt()
  @Min(1)
  minFlights!: number

  @IsInt()
  @Min(1)
  @Max(60)
  validMonths!: number
}

/** `PUT /staff/loyalty/earn-rules/:fareClassId`. NUMERIC(4, 2) as text, e.g. "1.25"; "0" earns nothing. */
export class EarnRuleDto {
  @IsString()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: 'Enter a multiplier from 0 to 99.99, e.g. 1.25.' })
  multiplier!: string
}

/** `PUT /staff/loyalty/settings/:key`. */
export class SettingDto {
  @IsInt()
  value!: number
}

export class InsuranceDto {
  @IsIn(['none', 'included', 'member_price'])
  kind!: Insurance['kind']

  @ValidateIf((o: InsuranceDto) => o.kind === 'member_price')
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  priceThb?: number
}

/** `PUT /staff/loyalty/tier-benefits/:code`. `loungeGuests` null = no lounge access, 0 = member only. */
export class TierBenefitsDto {
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(9)
  loungeGuests!: number | null

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(9999.9)
  extraBaggageKg!: number

  @IsBoolean()
  priorityCheckIn!: boolean

  @IsBoolean()
  priorityBoarding!: boolean

  @IsBoolean()
  upgradeEligible!: boolean

  @ValidateNested()
  @Type(() => InsuranceDto)
  insurance!: InsuranceDto
}

const AWARD_CABINS = ['economy', 'premium_economy', 'business', 'first']

/** `POST /staff/loyalty/awards`: release award seats on one flight and cabin, with the miles price per seat. */
export class ReleaseAwardDto {
  @IsUUID()
  flightId!: string

  @IsIn(AWARD_CABINS)
  cabin!: string

  @IsInt()
  @Min(0)
  @Max(999)
  seats!: number

  @IsInt()
  @Min(1)
  @Max(10_000_000)
  milesCost!: number
}

/** `PUT /staff/loyalty/awards/:flightId/:cabin`: change the seats set aside, the miles price, or both. */
export class UpdateAwardDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  seats?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  milesCost?: number
}

/** `GET /staff/loyalty/awards?from=&to=`: flights departing in the window (default: yesterday to 90 days ahead). */
export class AwardFlightsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string

  @IsOptional()
  @IsDateString()
  to?: string
}
