import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { CURRENCY_CODE_PATTERN } from '../../currency-rate/currency-code.pipe'

export class CreateFareQuoteDto {
  @IsUUID()
  flight_id!: string

  @IsUUID()
  fare_class_id!: string

  // Checked against the seat map values in the service, so a bad value is 422 SEAT_TYPE_UNKNOWN rather than a 400.
  @IsOptional()
  @IsString()
  seat_type?: string

  // The code as the customer typed it; checkPromo ignores case and spaces. An unknown code is PROMO_INVALID, not a 400.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  promo_code?: string

  // Also return the total converted into this currency. Display only: never stored or charged.
  @IsOptional()
  @Matches(CURRENCY_CODE_PATTERN, { message: 'display_currency must be exactly 3 uppercase letters, e.g. USD' })
  display_currency?: string
}
