import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { BAG_COLOURS, BAG_TYPES, type BagColour, type BagType } from '../common/baggage.constants'
import { BAGGAGE_TAG_PATTERN } from '../common/baggage-tag.util'
import { IsPhoneNumber } from '../common/phone-number'

/**
 * Body of `POST /api/staff/lost-reports`: a passenger at the desk reports a missing bag. The staff member comes from
 * the token. Contact details left out are taken from the booking. The service repeats these checks.
 */
export class CreateStaffLostReportDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{6}$/, { message: 'bookingReference must be 6 letters or digits' })
  bookingReference: string

  @IsUUID()
  passengerId: string

  @IsUUID()
  flightId: string

  @IsIn(BAG_TYPES)
  bagType: BagType

  @IsIn(BAG_COLOURS)
  colour: BagColour

  @IsOptional()
  @IsString()
  @Matches(BAGGAGE_TAG_PATTERN, { message: 'tagNumber must be 10 digits starting with 0' })
  tagNumber?: string

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

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string

  @IsOptional()
  @IsString()
  @IsPhoneNumber()
  contactPhone?: string
}
