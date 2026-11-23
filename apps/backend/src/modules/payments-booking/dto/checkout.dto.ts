import { Transform } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator'

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value)

/** Body of `POST /api/checkout`: the held booking (flight or cargo) to pay for and, optionally, a compensation voucher. */
export class CheckoutDto {
  /** A held flight booking's reference. Send this or `cargo_booking_id`, not both. */
  @ValidateIf((dto: CheckoutDto) => dto.cargo_booking_id === undefined && dto.payment_id === undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  booking_reference?: string

  /** A held cargo booking (feature 17). The shipper pays; the card is captured once 17's booking is confirmed. */
  @ValidateIf((dto: CheckoutDto) => dto.booking_reference === undefined && dto.payment_id === undefined)
  @IsUUID()
  cargo_booking_id?: string

  /**
   * A payment another feature already started for the customer, such as an onboard order (feature 12) or an excess-baggage
   * charge. It is paid like any other: the hosted page for a card, or on the spot for the fake provider.
   */
  @ValidateIf((dto: CheckoutDto) => dto.booking_reference === undefined && dto.cargo_booking_id === undefined)
  @IsUUID()
  payment_id?: string

  /** Add the travel insurance the booker's loyalty tier sells at a member price, paid with the fare. Flight bookings only. */
  @IsOptional()
  @IsBoolean()
  add_insurance?: boolean

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  voucher_code?: string
}

/** What `POST /api/checkout` answers: where to send the customer, or the payment's state when no page is needed. */
export interface CheckoutResultDto {
  payment_id: string
  status: string
  /** Stripe's hosted page. Null when the payment was settled on the spot (the fake provider, a voucher, zero cash). */
  checkout_url: string | null
}
