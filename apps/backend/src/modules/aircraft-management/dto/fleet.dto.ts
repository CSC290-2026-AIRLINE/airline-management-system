import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsNumber, Max, Min } from 'class-validator'

export class FleetReserveQueryDto {
  @IsDateString()
  date!: string

  @Type(() => Number)
  @IsInt()
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
