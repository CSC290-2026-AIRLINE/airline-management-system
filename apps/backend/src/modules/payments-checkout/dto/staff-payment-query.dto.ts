import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { PAYMENT_SOURCE_FEATURES } from '../payment.types'
import { STAFF_PAYMENT_FILTERS } from '../payment-status'
import type { PaymentSourceFeature } from '../payment.types'
import type { StaffPaymentFilter } from '../payment-status'

/**
 * Query string for `GET /api/staff/payments` — the payment lookup.
 *
 * `status` takes the frames' filter labels, not the database statuses: `capture_stalled` is a flag on the row and
 * `refunded` is the `reversed` status. `payment-status.ts` owns that mapping.
 *
 * `search` is the free-text box on the page: a payment reference, a booking reference, a customer's name or email, or
 * the last four digits of a card.
 *
 * `page` is 1-based and `limit` is the page size — the frames show "Previous / Next" and a "1–10 of N" line.
 */
export class StaffPaymentQueryDto {
  @IsOptional()
  @IsIn(STAFF_PAYMENT_FILTERS)
  status?: StaffPaymentFilter

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsIn(PAYMENT_SOURCE_FEATURES)
  source_feature?: PaymentSourceFeature

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}
