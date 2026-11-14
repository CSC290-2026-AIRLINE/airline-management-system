import { Transform, Type } from 'class-transformer'
import { IsInt, IsString, Max, Min } from 'class-validator'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, readQueryInt, readQueryText } from './search-passengers.dto'

/**
 * Query contract for `GET /api/staff/customers`.
 *
 * Identical to {@link SearchPassengersDto} minus `type`: this route only ever answers with
 * account holders, so there is nothing for a caller to select and no `type` to send. Declaring
 * the class separately is what keeps that honest — reusing `SearchPassengersDto` here would
 * advertise a parameter the route ignores, and a `type=traveller` would be silently ignored
 * rather than rejected.
 *
 * The `q`, `page` and `size` readers are the *same* functions the passenger route uses, so the
 * two normalise identically and cannot drift.
 */

/**
 * Query parameters are always strings, so `page` and `size` need `@Type` before `@IsInt` can
 * see them. A value that is not a number becomes `NaN` and fails here rather than reaching the
 * query builder.
 */
export class SearchCustomersDto {
  /**
   * Free text matched against the Latin and Thai name parts, the passport number, the account
   * holder's email and the date of birth, plus the passenger id when the term is a UUID.
   *
   * Every term has to match, exactly as on the passenger route, so `q` behaves identically
   * whichever route the Account holders tab is reading.
   */
  @Transform(readQueryText(''))
  @IsString()
  q = ''

  @Type(() => Number)
  @Transform(readQueryInt(1))
  @IsInt()
  @Min(1)
  page = 1

  @Type(() => Number)
  @Transform(readQueryInt(DEFAULT_PAGE_SIZE))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  size = DEFAULT_PAGE_SIZE
}
