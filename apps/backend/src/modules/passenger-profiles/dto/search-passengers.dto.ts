import { Transform, Type, type TransformFnParams } from 'class-transformer'
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator'

/** Which side of the customer/traveller split a result belongs to. */
export type PersonType = 'all' | 'accountHolder' | 'traveller'

const PERSON_TYPES: readonly PersonType[] = ['all', 'accountHolder', 'traveller']

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/**
 * Query contract for `GET /api/staff/passengers`.
 *
 * `page` is 1-based and `size` is capped at {@link MAX_PAGE_SIZE}.
 *
 * Pagination is page-based rather than cursor-based, against the usual preference in the
 * backend README: the staff-web results pager addresses pages by number, so a cursor
 * would break the only client of this endpoint. Revisit this together if that pager ever
 * changes.
 */

/** An absent or blank query parameter falls back to `fallback`; `Number` then turns `'3'` into `3`. */
export function readQueryText(fallback: string) {
  return ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') {
      return value ?? fallback
    }
    const trimmed = value.trim()
    return trimmed === '' ? fallback : trimmed
  }
}

/**
 * Query parameters are always strings, so `page` and `size` need `@Type` before
 * `@IsInt` can see them. A value that is not a number becomes `NaN` and fails here rather
 * than reaching the query builder.
 *
 * Exported for `SearchCustomersDto`, which pages identically and must normalise the same way.
 */
export function readQueryInt(fallback: number) {
  return ({ value }: TransformFnParams): unknown => {
    const text = readQueryText(String(fallback))({ value } as TransformFnParams)
    if (typeof text !== 'string') {
      return text
    }
    return text === '' ? fallback : Number(text)
  }
}

/** `passenger.id` is a `@db.Uuid`, so a non-UUID search term must never reach an `id` comparison. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function looksLikeUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export class SearchPassengersDto {
  /**
   * Free text matched against the Latin and Thai name parts, the passport number,
   * the account holder's email and the date of birth, plus the passenger id when
   * the term is a UUID.
   *
   * Split on whitespace, with every term required to match, so a full name works.
   * The query string parser has already trimmed it; see {@link readQueryText}.
   */
  @Transform(readQueryText(''))
  @IsString()
  q = ''

  @Transform(readQueryText('all'))
  @IsIn(PERSON_TYPES)
  type: PersonType = 'all'

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
