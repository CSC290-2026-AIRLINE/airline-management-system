import { IsBoolean, IsNumber, IsOptional, IsPositive, IsUUID, Max, Min } from 'class-validator'

export class CreateBaggageRateDto {
  @IsUUID()
  fare_class_id!: string

  // Feature 2's route; checked to exist in the service. Empty or null = the default for this fare class.
  @IsOptional()
  @IsUUID()
  route_id?: string | null

  // NUMERIC(5, 1) with CHECK (free_allowance_kg >= 0)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(9999.9)
  free_allowance_kg!: number

  // NUMERIC(12, 2) with CHECK (rate_per_kg >= 0)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  rate_per_kg!: number

  // NUMERIC(5, 1) with CHECK (max_bag_kg > 0). Empty or null = no limit.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  @Max(9999.9)
  max_bag_kg?: number | null

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
