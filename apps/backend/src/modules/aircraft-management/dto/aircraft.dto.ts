import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export const AIRCRAFT_STATUS_VALUES = ['in_service', 'grounded'] as const
export type AircraftStatusValue = (typeof AIRCRAFT_STATUS_VALUES)[number]

export const MAINTENANCE_TYPE_VALUES = ['a_check', 'b_check', 'c_check', 'd_check', 'unscheduled'] as const
export type MaintenanceTypeValue = (typeof MAINTENANCE_TYPE_VALUES)[number]

export const MAINTENANCE_STATUS_VALUES = ['planned', 'in_progress', 'completed', 'cancelled'] as const
export type MaintenanceStatusValue = (typeof MAINTENANCE_STATUS_VALUES)[number]

export class CreateAircraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  tail_number!: string

  @IsUUID()
  aircraft_type_id!: string

  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'base_airport_code must be a 3-letter IATA code' })
  base_airport_code!: string

  @IsDateString()
  entry_into_service_date!: string
}

export class UpdateAircraftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  tail_number?: string

  /** The type can change only while no flight uses the aircraft; the backend answers 409 otherwise. */
  @IsOptional()
  @IsUUID()
  aircraft_type_id?: string

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'base_airport_code must be a 3-letter IATA code' })
  base_airport_code?: string

  @IsOptional()
  @IsDateString()
  retired_on?: string | null
}

/**
 * `in_maintenance` is not accepted here: an aircraft enters maintenance through a maintenance
 * window, which creates the matching status period.
 */
export class CreateAircraftStatusDto {
  @IsIn(AIRCRAFT_STATUS_VALUES)
  status!: AircraftStatusValue

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string

  @IsDateString()
  start_date!: string

  @IsOptional()
  @IsDateString()
  end_date?: string | null
}

export class CreateAircraftMaintenanceDto {
  @IsIn(MAINTENANCE_TYPE_VALUES)
  maintenance_type!: MaintenanceTypeValue

  @IsDateString()
  planned_start_date!: string

  @IsDateString()
  planned_end_date!: string
}

export class UpdateAircraftMaintenanceDto {
  @IsOptional()
  @IsIn(MAINTENANCE_STATUS_VALUES)
  status?: MaintenanceStatusValue

  @IsOptional()
  @IsDateString()
  planned_start_date?: string

  @IsOptional()
  @IsDateString()
  planned_end_date?: string

  @IsOptional()
  @IsDateString()
  actual_end_date?: string | null
}

export class SetOperatingDaysDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  days!: number[]
}

export class AvailabilityQueryDto {
  @IsOptional()
  @IsUUID()
  type?: string

  @IsOptional()
  @IsDateString()
  from?: string

  @IsOptional()
  @IsDateString()
  to?: string

  @IsOptional()
  @IsDateString()
  dep_date?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  distance_km?: number
}

export class AircraftListQueryDto {
  @IsOptional()
  @IsUUID()
  type?: string

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'base must be a 3-letter IATA code' })
  base?: string

  @IsOptional()
  @IsIn(AIRCRAFT_STATUS_VALUES)
  status?: AircraftStatusValue
}

export class StatusChangesQueryDto {
  @IsOptional()
  @IsDateString()
  since?: string
}
