import { Transform } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Query string for `GET /api/receipts` — the customer's own receipts, newest first.
 *
 * TODO(F5a): add a cursor once the real repository pages over `receipt.issued_at`. The mock returns everything under
 * the limit, so the field is accepted but not yet honoured.
 */
export class ReceiptQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
