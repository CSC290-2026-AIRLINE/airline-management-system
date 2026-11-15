import { Type } from 'class-transformer'
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator'
import { FAKE_OUTCOMES, type FakeOutcome } from '../providers/fake.provider'
import { REFUND_STATUSES } from '../payment-state'

const MONEY = { maxDecimalPlaces: 2 } as const

export class CheckoutDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,12}$/, { message: 'booking_reference must be 4 to 12 letters or digits' })
  booking_reference?: string

  @IsOptional()
  @IsUUID()
  cargo_booking_id?: string

  @IsOptional()
  @IsString()
  @Length(10, 14)
  voucher_code?: string
}

export class ValidateVoucherDto {
  @IsString()
  @Length(10, 14)
  code!: string

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,12}$/)
  booking_reference?: string

  @IsOptional()
  @IsUUID()
  cargo_booking_id?: string
}

export class RefundRequestDto {
  @IsUUID()
  payment_id!: string

  @IsOptional()
  @IsUUID()
  payment_line_id?: string

  @IsString()
  @Length(3, 500)
  note!: string
}

export const STAFF_REFUND_REASONS = ['customer_request', 'staff_adjustment', 'rebook_difference'] as const

export class StaffRefundDto {
  @IsUUID()
  payment_id!: string

  @IsIn(STAFF_REFUND_REASONS)
  reason!: (typeof STAFF_REFUND_REASONS)[number]

  @IsIn(['original', 'voucher'])
  method!: 'original' | 'voucher'

  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  @Max(9_999_999_999)
  amount!: number

  @IsOptional()
  @IsUUID()
  payment_line_id?: string

  @IsOptional()
  @IsBoolean()
  waive_fee?: boolean

  @IsString()
  @Length(3, 500)
  note!: string
}

export class DecideRefundDto {
  @IsIn(['approve', 'reject', 'reissue_voucher'])
  action!: 'approve' | 'reject' | 'reissue_voucher'

  @IsString()
  @Length(3, 500)
  note!: string
}

export class CompensationDto {
  @IsUUID()
  case_compensation_id!: string

  @IsOptional()
  @IsIn(['refund', 'voucher'])
  form?: 'refund' | 'voucher'

  @IsOptional()
  @IsUUID()
  payment_id?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0.01)
  amount?: number
}

export class CancelVoucherDto {
  @IsString()
  @Length(3, 500)
  reason!: string
}

export class RefundQueueQueryDto {
  @IsOptional()
  @IsIn(REFUND_STATUSES)
  status?: string
}

export class VoucherQueryDto {
  @IsOptional()
  @IsIn(['active', 'redeemed', 'expired', 'cancelled'])
  status?: string

  @IsOptional()
  @IsUUID()
  customer_id?: string

  @IsOptional()
  @IsString()
  @Length(1, 14)
  code?: string
}

export class PaymentSearchQueryDto {
  @IsString()
  @Length(2, 120)
  q!: string
}

export class PostingsQueryDto {
  @IsDateString()
  from!: string

  @IsDateString()
  to!: string

  @IsOptional()
  @IsString()
  type?: string
}

export class FakeCompleteDto {
  @IsIn(FAKE_OUTCOMES)
  outcome!: FakeOutcome
}
