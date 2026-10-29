import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator'

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
  weight_kg!: number
}
