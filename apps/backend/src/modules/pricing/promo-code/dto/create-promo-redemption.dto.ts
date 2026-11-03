import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

// Body of POST /promo-codes/:id/redemptions, sent by Feature 3b when a booking is confirmed.
export class CreatePromoRedemptionDto {
  @IsUUID()
  fare_quote_id!: string

  // Accepted so 3b can send what the spec lists, but not stored: promo_redemption has no booking_ref column yet
  // (Database Team change requested). Until it does, undo a redemption by fare quote id.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  booking_ref?: string
}
