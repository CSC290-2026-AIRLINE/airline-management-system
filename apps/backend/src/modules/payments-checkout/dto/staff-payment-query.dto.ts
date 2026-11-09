import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { PAYMENT_SOURCE_FEATURES } from '../payment.types'
import { STAFF_PAYMENT_FILTERS } from '../payment-status'
import type { PaymentSourceFeature } from '../payment.types'
import type { StaffPaymentFilter } from '../payment-status'

/**
 * Query string for `GET /api/staff/payments` — the payment lookup.
 *
 * `status` takes the frames' filter labels, not the database statuses: `capture_stalled` is a flag on the row and
 * `refunded` is the `reversed` status. `payment-status.ts` owns that mapping.
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
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}
