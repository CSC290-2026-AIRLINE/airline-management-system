import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { BAG_COLOURS, BAG_TYPES, type BagColour, type BagType } from '../common/baggage.constants'
import { BAGGAGE_TAG_PATTERN } from '../common/baggage-tag.util'

export class PassengerReportAccessQuery {
  @Matches(/^[A-Za-z0-9]{6}$/)
  bookingReference!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  surname!: string
}

export class CreatePassengerLostReportDto extends PassengerReportAccessQuery {
  @IsUUID()
  flightId!: string

  @IsIn(BAG_TYPES)
  bagType!: BagType

  @IsIn(BAG_COLOURS)
  colour!: BagColour

  @IsOptional()
  @Matches(BAGGAGE_TAG_PATTERN)
  tagNumber?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string | null

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{6,30}$/)
  contactPhone?: string | null
}
