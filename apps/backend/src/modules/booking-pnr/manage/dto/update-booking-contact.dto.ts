import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * The body of `PUT /bookings/:ref/contact`.
 *
 * The contact details are written when the hold is created, so a customer who typed the wrong email has to correct it
 * before paying. The details are not part of the fare quote, so changing them never moves the price.
 */
export class UpdateBookingContactDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  contactEmail!: string

  /** Optional: a booking can be made without a phone number. A blank string clears it. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  contactPhone?: string
}
