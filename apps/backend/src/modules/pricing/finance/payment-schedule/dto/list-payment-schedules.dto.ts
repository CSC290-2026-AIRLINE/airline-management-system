import { IsIn, IsOptional } from 'class-validator'
import { PAYMENT_SCHEDULE_STATUSES, type PaymentScheduleStatus } from '../../finance.constants'

// Query string for GET /staff/payment-schedules, e.g. ?status=scheduled or ?overdue=true
export class ListPaymentSchedulesDto {
  @IsOptional()
  @IsIn(PAYMENT_SCHEDULE_STATUSES)
  status?: PaymentScheduleStatus

  @IsOptional()
  @IsIn(['true', 'false'])
  overdue?: 'true' | 'false'
}
