import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { SEAT_TYPES, type SeatType } from '../../pricing.constants'

export class CreateFareQuoteDto {
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
