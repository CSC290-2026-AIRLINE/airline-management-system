import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator'

export const CABIN_CLASSES = ['first', 'business', 'premium_economy', 'economy'] as const
export type CabinClass = (typeof CABIN_CLASSES)[number]

/**
 * The seat layout stored in `aircraft_type.layout` (JSONB). A layout is immutable once the aircraft
 * type exists, so these types describe the JSON document rather than a database column.
 */
export type CabinLayout = {
  cabin_class: CabinClass
  first_row: number
  last_row: number
  columns: string[]
  aisle_after?: string[]
  skip_rows?: number[]
  row_types?: Record<string, number[]>
  blocked_seats?: string[]
}

export type SeatLayout = {
  cabins: CabinLayout[]
}

export class CabinLayoutDto implements CabinLayout {
  @IsIn(CABIN_CLASSES)
  cabin_class!: CabinClass

  @IsInt()
  @Min(1)
  first_row!: number

  @IsInt()
  @Min(1)
  last_row!: number

  @IsArray()
  @IsString({ each: true })
  @Matches(/^[A-Z]$/, { each: true, message: 'each column must be a single capital letter' })
  columns!: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aisle_after?: string[]

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  skip_rows?: number[]

  @IsOptional()
  @IsObject()
  row_types?: Record<string, number[]>

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blocked_seats?: string[]
}

export class SeatLayoutDto implements SeatLayout {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CabinLayoutDto)
  cabins!: CabinLayoutDto[]
}
