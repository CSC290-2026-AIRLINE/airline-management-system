import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import type { Cabin } from '../../booking-pnr/contracts'

export class SearchLegDto {
  @Matches(/^[A-Z]{3}$/)
  origin!: string

  @Matches(/^[A-Z]{3}$/)
  destination!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date!: string
}

export class SearchFlightsDto {
  @IsIn(['one_way', 'return', 'multi_city'])
  tripType!: 'one_way' | 'return' | 'multi_city'

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SearchLegDto)
  legs!: SearchLegDto[]

  @IsInt()
  @Min(0)
  @Max(9)
  adults!: number

  @IsInt()
  @Min(0)
  @Max(9)
  children!: number

  @IsInt()
  @Min(0)
  @Max(9)
  infants!: number

  @IsOptional()
  @IsIn(['economy', 'premium_economy', 'business', 'first'])
  cabin?: Cabin

  @IsOptional()
  @IsIn(['price', 'departure', 'duration'])
  sortBy?: 'price' | 'departure' | 'duration'
}
