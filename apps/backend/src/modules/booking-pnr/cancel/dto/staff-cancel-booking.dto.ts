import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * B7: the body of `POST /staff/bookings/:ref/cancel`.
 *
 * The reason is required (the staff dialog always sends one) and the fee waiver is optional (D8). The reason is a
 * free text: the booking has no column for it, so it goes into the Feature 15 audit entry next to the cancellation.
 */
export class StaffCancelBookingDto {
  /** Why the agent cancelled the booking. Trimmed, so a blank reason is a missing reason. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string

  /** D8: waive the cancellation fee, so the customer gets the fee back in the refund. */
  @IsOptional()
  @IsBoolean()
  waiveFee?: boolean
}
