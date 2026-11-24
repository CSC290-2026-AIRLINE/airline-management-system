import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength } from 'class-validator'
import { BAG_COST_KINDS, MAX_COST_AMOUNT, type BagCostKind } from '../common/lost-report.types'

/** Body of `POST /api/staff/lost-reports/:id/costs`. The amount is in the finance base currency. */
export class AddBagCostDto {
  @IsIn(BAG_COST_KINDS)
  kind: BagCostKind

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_COST_AMOUNT)
  amount: number

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string
}
