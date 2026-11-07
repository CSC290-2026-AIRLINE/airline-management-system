import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator'
import { FOUND_BAG_STATUSES, type FoundBagStatus } from '../common/found-bag.types'
import { BAGGAGE_TAG_PATTERN } from '../common/baggage-tag.util'

/** Query of `GET /api/staff/found-bags`. Every filter is optional; filters combine with AND. */
export class ListFoundBagsQuery {
  @IsOptional()
  @IsString()
  @Matches(BAGGAGE_TAG_PATTERN, { message: 'tagNumber must be 10 digits starting with 0' })
  tagNumber?: string

  @IsOptional()
  @IsIn(FOUND_BAG_STATUSES)
  status?: FoundBagStatus

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'foundAirport must be a 3-letter IATA code' })
  foundAirport?: string

  @IsOptional()
  @IsUUID()
  flightId?: string
}
