import { Transform } from 'class-transformer'
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator'

/** Trims a string before it is validated, so a reason that is only spaces is empty. */
const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value)

/** What a staff member can decide on a refund in the queue. */
export const REFUND_DECISIONS = ['approve_card', 'approve_voucher', 'reject'] as const
export type RefundDecision = (typeof REFUND_DECISIONS)[number]

/**
 * Body of `POST /api/staff/refunds/:id/decision`.
 *
 * `reason` is required whatever the decision is — the frame says "Reason (required, sent to the customer)" — and the
 * schema needs it for a rejection (`CHECK (status <> 'rejected' OR decision_note IS NOT NULL)`).
 */
export class RefundDecisionDto {
  @IsIn(REFUND_DECISIONS)
  decision!: RefundDecision

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'A reason is required, and it is sent to the customer' })
  @MaxLength(500)
  reason!: string
}

/**
 * Body of `POST /api/refunds` — the customer's "Request a refund" dialog.
 *
 * The real request names a `payment_line` to refund; the mock takes the line in words, the way the dialog shows it.
 */
export class CreateRefundRequestDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9]{6}$/, { message: 'booking_reference must be a six-character booking reference' })
  booking_reference!: string

  /** The item to refund, as the dialog lists it: "Extra baggage · 1 × 20 kg · FY214". */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  item!: string

  /** What the customer expects back — the dialog's "Estimated return". */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Tell us why you are asking for a refund' })
  @MaxLength(500)
  reason!: string
}

/** What a compensation can be: a new voucher, or money back to the card. */
export const COMPENSATION_KINDS = ['voucher', 'card_refund'] as const

/** Body of `POST /api/staff/compensation` — the "Issue compensation" dialog. */
export class IssueCompensationDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9]{6}$/, { message: 'booking_reference must be a six-character booking reference' })
  booking_reference!: string

  @IsIn(COMPENSATION_KINDS)
  kind!: (typeof COMPENSATION_KINDS)[number]

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'A reason is required' })
  @MaxLength(500)
  reason!: string
}

/** Body of `POST /api/staff/vouchers/:id/void`. The reason is optional; the schema's `cancel_reason` is filled either way. */
export class VoidVoucherDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string
}
