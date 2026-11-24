import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { COMPENSATION_FILTERS, MY_REFUND_TABS, REFUND_QUEUE_TABS } from '../refund-status'
import type { CompensationFilter, MyRefundTab, RefundQueueTab } from '../refund-status'

/**
 * Query string for `GET /api/staff/refunds` — the refund queue.
 *
 * `tab` is the frames' tab: `all`, `needs_review` or `done`. `search` is a reference or a booking reference.
 */
export class RefundQueueQueryDto {
  @IsOptional()
  @IsIn(REFUND_QUEUE_TABS)
  tab?: RefundQueueTab

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string
}

/** Query string for `GET /api/refunds` — the customer's own refunds. `search` takes a booking or a refund number. */
export class MyRefundQueryDto {
  @IsOptional()
  @IsIn(MY_REFUND_TABS)
  tab?: MyRefundTab

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string
}

/** Query string for `GET /api/staff/compensation` — the compensation history. */
export class CompensationQueryDto {
  @IsOptional()
  @IsIn(COMPENSATION_FILTERS)
  filter?: CompensationFilter

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string
}
