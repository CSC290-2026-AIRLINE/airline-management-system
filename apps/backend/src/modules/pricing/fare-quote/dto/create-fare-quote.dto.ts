import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { CURRENCY_CODE_PATTERN } from '../../currency-rate/currency-code.pipe'
import { SEAT_TYPES, type SeatType } from '../../pricing.constants'

// ?display_currency on GET /fare-quotes/:id, and the same field on POST.
export class DisplayCurrencyDto {
  // Shows the total in this currency as well. Never stored: the quote stays in the base currency.
  @IsOptional()
  @Matches(CURRENCY_CODE_PATTERN, { message: 'display_currency must be 3 uppercase letters, e.g. THB' })
  display_currency?: string
}

export class CreateFareQuoteDto extends DisplayCurrencyDto {
  @IsUUID()
  flight_id!: string

  @IsUUID()
  fare_class_id!: string

  @IsOptional()
  @IsIn(SEAT_TYPES)
  seat_type?: SeatType

  // The code as the customer typed it; checkPromo ignores case and spaces. An unknown code is PROMO_INVALID, not a 400.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  promo_code?: string
}
