import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { CABINS, type Cabin } from '../../pricing.constants'

export class CreateFareClassDto {
  @Matches(/^[A-Z0-9]{1,3}$/, { message: 'code must be 1-3 uppercase letters or digits' })
  code!: string

  @IsIn(CABINS)
  cabin!: Cabin

  @IsString()
  @MaxLength(100)
  name!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  min_advance_purchase_days?: number

  @IsOptional()
  @IsBoolean()
  refundable?: boolean

  @IsOptional()
  @IsBoolean()
  changeable?: boolean

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cancel_fee_flat?: number

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  cancel_fee_pct?: number

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  change_fee_flat?: number

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  change_fee_pct?: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
