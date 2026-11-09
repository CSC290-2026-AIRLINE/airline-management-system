import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

export const CABIN_CLASSES = ['first', 'business', 'premium_economy', 'economy'] as const
export type CabinClass = (typeof CABIN_CLASSES)[number]

/** The row types a row can carry; a row without an entry is a normal row. */
export const ROW_TYPE_KEYS = ['exit_row', 'extra_legroom', 'normal'] as const

/**
 * Upper bounds of a layout. A layout is expanded seat by seat when a seat map is requested, so an unbounded
 * `last_row` or column list would let one request exhaust memory. The limits sit above the largest real aircraft.
 */
export const MAX_CABINS = 8
export const MAX_ROW = 200
export const MAX_COLUMNS = 10
export const MAX_LAYOUT_SEATS = 1000

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
  @Max(MAX_ROW)
  first_row!: number

  @IsInt()
  @Min(1)
  @Max(MAX_ROW)
  last_row!: number

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_COLUMNS)
  @IsString({ each: true })
  @Matches(/^[A-Z]$/, { each: true, message: 'each column must be a single capital letter' })
  columns!: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COLUMNS)
  @IsString({ each: true })
  aisle_after?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROW)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_ROW, { each: true })
  skip_rows?: number[]

  @IsOptional()
  @IsObject()
  row_types?: Record<string, number[]>

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LAYOUT_SEATS)
  @IsString({ each: true })
  blocked_seats?: string[]
}

export class SeatLayoutDto implements SeatLayout {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CABINS)
  @ValidateNested({ each: true })
  @Type(() => CabinLayoutDto)
  cabins!: CabinLayoutDto[]
}
