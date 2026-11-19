import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { STAFF_MOVE_ACTIONS, type StaffMoveAction } from '../common/bag-location.types'

/**
 * Body of `POST /api/staff/found-bags/:id/locations`. The airport of the event is where the bag is (or, for arrived,
 * where it was sent), so the body never names it.
 */
export class RecordMoveDto {
  @IsIn(STAFF_MOVE_ACTIONS)
  action: StaffMoveAction

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'toAirport must be a 3-letter IATA code' })
  toAirport?: string

  @IsOptional()
  @IsUUID()
  sentOnFlightId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string
}
