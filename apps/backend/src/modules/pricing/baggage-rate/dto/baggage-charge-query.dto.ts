import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsPositive, IsUUID, Min } from 'class-validator'

export class BaggageChargeQueryDto {
  @IsUUID()
  fare_class_id!: string

  // Leave out to use the fare class default.
  @IsOptional()
  @IsUUID()
  route_id?: string

  // Query strings arrive as text, so convert before validating.
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  // The passenger's total checked weight.
  weight_kg!: number

  // The single heaviest bag. Over the rate's max_bag_kg it is refused, not charged. Leave out to skip that check.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  heaviest_bag_kg?: number

  // Extra free kilograms from the passenger's tier (feature 10 reads it from feature 7). Default 0.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  extra_allowance_kg?: number
}
