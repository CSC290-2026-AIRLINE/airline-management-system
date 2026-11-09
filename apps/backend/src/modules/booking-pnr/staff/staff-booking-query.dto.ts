import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator'
import type { BookingStatus } from '../contracts'

const filtersEnabled = (value: StaffBookingQueryDto) => typeof value.search !== 'string' || !value.search.trim()

export class StaffBookingQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string

  @ValidateIf(filtersEnabled)
  @IsOptional()
  @IsIn(['booked', 'travelling'])
  dateType?: 'booked' | 'travelling'

  @ValidateIf(filtersEnabled)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string

  @ValidateIf(filtersEnabled)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string

  @ValidateIf(filtersEnabled)
  @IsOptional()
  @IsIn(['held', 'confirmed', 'cancelled', 'expired'])
  status?: BookingStatus

  @ValidateIf(filtersEnabled)
  @IsOptional()
  @IsUUID()
  flightId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number
}
