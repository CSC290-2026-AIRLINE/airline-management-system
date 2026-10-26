import { IsIn } from 'class-validator'
import { CABINS, SEAT_TYPES, type Cabin, type SeatType } from '../../pricing.constants'

export class LookupSeatFeeDto {
  @IsIn(CABINS)
  cabin!: Cabin

  @IsIn(SEAT_TYPES)
  seat_type!: SeatType
}
