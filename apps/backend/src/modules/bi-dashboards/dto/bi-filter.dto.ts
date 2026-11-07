import { IsDateString, IsOptional, IsUUID } from 'class-validator'

/** Optional filters shared by every BI read endpoint. Dates are the flight's local service date. */
export class BiFilterDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string

  @IsOptional()
  @IsUUID()
  route_id?: string
}
