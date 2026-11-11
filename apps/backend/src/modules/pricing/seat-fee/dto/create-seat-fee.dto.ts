import { IsIn, IsNumber, Min } from 'class-validator'
import { CABINS, SEAT_TYPES, type Cabin, type SeatType } from '../../pricing.constants'

export class CreateSeatFeeDto {
  @IsIn(CABINS)
  cabin!: Cabin

  @IsIn(SEAT_TYPES)
  seat_type!: SeatType

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number
}
