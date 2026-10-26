import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { SeatLayoutDto } from './layout.dto'

export class CreateAircraftTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  manufacturer!: string

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  model!: string

  @ValidateNested()
  @Type(() => SeatLayoutDto)
  layout!: SeatLayoutDto

  @IsInt()
  @Min(0)
  hold_weight_limit_kg!: number

  @IsInt()
  @Min(0)
  max_takeoff_weight_kg!: number

  @IsInt()
  @Min(0)
  max_range_km!: number

  @IsInt()
  @Min(0)
  min_turnaround_minutes!: number

  @IsNumber()
  @Min(0)
  operating_cost_per_hour!: number

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  cost_currency!: string

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}

/**
 * A layout is immutable after creation, so `layout` is deliberately absent here: the whitelist pipe
 * rejects it instead of silently dropping it.
 */
export class UpdateAircraftTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  manufacturer?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  model?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  hold_weight_limit_kg?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  max_takeoff_weight_kg?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  max_range_km?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  min_turnaround_minutes?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  operating_cost_per_hour?: number

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  cost_currency?: string

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}

export class CloneAircraftTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string

  @IsOptional()
  @ValidateNested()
  @Type(() => SeatLayoutDto)
  layout?: SeatLayoutDto
}

export const AIRCRAFT_TYPE_UPDATABLE_FIELDS = [
  'code',
  'manufacturer',
  'model',
  'hold_weight_limit_kg',
  'max_takeoff_weight_kg',
  'max_range_km',
  'min_turnaround_minutes',
  'operating_cost_per_hour',
  'cost_currency',
  'is_active',
] as const

export type AircraftTypeUpdatableField = (typeof AIRCRAFT_TYPE_UPDATABLE_FIELDS)[number]
