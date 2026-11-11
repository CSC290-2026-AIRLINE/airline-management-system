import { IsIn, IsOptional } from 'class-validator'
import { CABINS, SEAT_TYPES, type Cabin, type SeatType } from '../../pricing.constants'

export class LookupSeatFeeDto {
  @IsIn(CABINS)
  cabin!: Cabin

  @IsIn(SEAT_TYPES)
  seat_type!: SeatType

  // The seat type the passenger holds now. On an upgrade they pay only the difference.
  @IsOptional()
  @IsIn(SEAT_TYPES)
  from_seat_type?: SeatType
}
