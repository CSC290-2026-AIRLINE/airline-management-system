import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { BAG_COLOURS, BAG_TYPES, type BagColour, type BagType } from '../common/baggage.constants'
import { BAGGAGE_TAG_PATTERN } from '../common/baggage-tag.util'

/**
 * A guest (no-account) lost bag report. The booking, traveller and flight fields are only checked to be strings here:
 * GuestBookingLookupService verifies them together on the server and answers every mismatch with the same failure.
 * There is deliberately no flightId, passengerId or bookingPassengerId field; with forbidNonWhitelisted a request that
 * sends one is rejected. The bag fields use the same rules as CreatePassengerLostReportDto.
 */
export class CreateGuestLostReportDto {
  @IsString()
  bookingReference!: string

  @IsString()
  surname!: string

  /** From the guest traveller options. Untrusted: it must resolve on the verified booking for the chosen flight. */
  @IsString()
  travellerId!: string

  @IsString()
  flightNumber!: string

  /** YYYY-MM-DD, as returned by the guest lookup. */
  @IsString()
  serviceDate!: string

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
