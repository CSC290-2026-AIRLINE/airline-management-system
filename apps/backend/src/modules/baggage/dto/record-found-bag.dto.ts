import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { BAG_COLOURS, BAG_TYPES, type BagColour, type BagType } from '../common/baggage.constants'
import { BAGGAGE_TAG_PATTERN } from '../common/baggage-tag.util'

/**
 * Body of `POST /api/staff/found-bags`. The recording staff member comes from the token, never from the body.
 * The service repeats these checks, so it stays safe when called from other code.
 */
export class RecordFoundBagDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'foundAirport must be a 3-letter IATA code' })
  foundAirport: string

  @IsIn(BAG_TYPES)
  bagType: BagType

  @IsIn(BAG_COLOURS)
  colour: BagColour

  @IsOptional()
  @IsString()
  @Matches(BAGGAGE_TAG_PATTERN, { message: 'tagNumber must be 10 digits starting with 0' })
  tagNumber?: string

  @IsOptional()
  @IsUUID()
  flightId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description?: string
}
