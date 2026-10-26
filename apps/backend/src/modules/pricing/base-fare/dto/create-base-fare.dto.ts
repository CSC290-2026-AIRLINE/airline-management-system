import { IsNumber, IsPositive, IsUUID, Max } from 'class-validator'

export class CreateBaseFareDto {
  // Feature 2's route; checked to exist in the service.
  @IsUUID()
  route_id!: string

  @IsUUID()
  fare_class_id!: string

  // NUMERIC(12, 2) with CHECK (amount > 0)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  amount!: number
}
