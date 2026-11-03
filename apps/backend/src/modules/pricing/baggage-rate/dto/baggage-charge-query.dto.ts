import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsPositive, IsUUID, Max, Min } from 'class-validator'

export class BaggageChargeQueryDto {
  @IsUUID()
  fare_class_id!: string

  // Leave out to use the fare class default.
  @IsOptional()
  @IsUUID()
  route_id?: string

  // Total checked weight for the passenger. Query strings arrive as text, so convert before validating.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  weight_kg!: number

  // The single heaviest bag, checked against max_bag_kg. Leave out for one bag (it is then weight_kg).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  heaviest_bag_kg?: number

  // Extra free kg on top of the fare class allowance, e.g. a loyalty tier bonus (Feature 7, passed on by Feature 10).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  extra_allowance_kg?: number
}
