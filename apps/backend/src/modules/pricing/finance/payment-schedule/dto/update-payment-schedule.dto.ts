import { PartialType } from '@nestjs/mapped-types'
import { CreatePaymentScheduleDto } from './create-payment-schedule.dto'

export class UpdatePaymentScheduleDto extends PartialType(CreatePaymentScheduleDto) {}
