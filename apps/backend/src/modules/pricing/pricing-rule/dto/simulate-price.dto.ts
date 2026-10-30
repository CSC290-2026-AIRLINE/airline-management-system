import { IsIn, IsNumber, Matches, Max, Min } from 'class-validator'
import { SEAT_TYPES, type SeatType } from '../../pricing.constants'

const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export class SimulatePriceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99) // base_fare.amount is NUMERIC(12,2)
  base_fare!: number

  @Matches(DATE_ONLY, { message: 'departure_date must be YYYY-MM-DD' })
  departure_date!: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  seats_left_pct!: number

  @IsIn(SEAT_TYPES)
  seat_type!: SeatType
}
