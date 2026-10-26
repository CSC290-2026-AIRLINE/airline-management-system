import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'
import { TAX_FEE_CALC_TYPES, TAX_FEE_KINDS, type TaxFeeCalcType, type TaxFeeKind } from '../../pricing.constants'

export class CreateTaxFeeDto {
  @Matches(/^[A-Z0-9_]{1,20}$/, { message: 'code must be 1-20 uppercase letters, digits or _' })
  code!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @IsIn(TAX_FEE_KINDS)
  kind!: TaxFeeKind

  @IsIn(TAX_FEE_CALC_TYPES)
  calc_type!: TaxFeeCalcType

  // An amount in THB if flat, a percent if pct (the service checks pct <= 100 on the final values).
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
