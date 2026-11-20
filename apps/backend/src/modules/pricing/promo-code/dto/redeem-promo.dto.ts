import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

export class RedeemPromoDto {
  // Feature 3b's booking reference. One use per booking, however many passengers or legs it has.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  booking_ref!: string

  // The quote the booking was priced with; it must carry this promo code.
  @IsUUID()
  fare_quote_id!: string
}
