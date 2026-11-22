import { IsUUID } from 'class-validator'
import { HoldBookingDto } from '../hold/dto/hold-booking.dto'

export class StaffHoldBookingDto extends HoldBookingDto {
  @IsUUID()
  customerId!: string
}
