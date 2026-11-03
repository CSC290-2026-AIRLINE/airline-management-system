import { IsIn, IsOptional } from 'class-validator'
import { CABINS, SEAT_TYPES, type Cabin, type SeatType } from '../../pricing.constants'

export class LookupSeatFeeDto {
  @IsIn(CABINS)
  cabin!: Cabin

  // The seat the passenger wants.
  @IsIn(SEAT_TYPES)
  seat_type!: SeatType

  // The seat they hold now, at check-in: they pay only the difference. Leave out for a new seat.
  @IsOptional()
  @IsIn(SEAT_TYPES)
  from_seat_type?: SeatType
}
