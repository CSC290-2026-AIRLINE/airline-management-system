import { Type } from 'class-transformer'
import { IsDateString, IsNumber, Max, Min } from 'class-validator'

export class FleetReserveQueryDto {
  @IsDateString()
  date!: string

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  aircraft_needed!: number
}

export class UpdateReserveRatioDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(9.99)
  value!: number
}
