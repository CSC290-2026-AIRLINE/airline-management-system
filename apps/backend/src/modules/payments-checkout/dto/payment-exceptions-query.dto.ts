import { IsIn, IsOptional } from 'class-validator'
import { PAYMENT_EXCEPTION_STATES } from '../payment.types'

/** The tabs of the staff "Payment exceptions" page: the three states plus the unfiltered view. */
export const PAYMENT_EXCEPTION_TABS = [...PAYMENT_EXCEPTION_STATES, 'all'] as const
export type PaymentExceptionTab = (typeof PAYMENT_EXCEPTION_TABS)[number]

/** Query string for `GET /api/staff/payment-exceptions`. */
export class PaymentExceptionsQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_EXCEPTION_TABS)
  tab?: PaymentExceptionTab
}
