import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { RECEIPT_FILTERS } from '../payment-status'
import type { ReceiptFilter } from '../payment-status'

/**
 * Query string for `GET /api/receipts` — the customer's own receipts, newest first.
 *
 * `search` is the box on the page: a booking reference, a receipt number or a city.
 * `filter` is one of the chips above the list.
 *
 * TODO(F5a): add a cursor once the real repository pages over `receipt.issued_at`. The mock returns everything under
 * the limit, so the field is accepted but not yet honoured.
 */
export class ReceiptQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsIn(RECEIPT_FILTERS)
  filter?: ReceiptFilter

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
