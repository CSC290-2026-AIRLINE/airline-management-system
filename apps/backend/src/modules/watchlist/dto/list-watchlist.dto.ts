import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import { WATCHLIST_STATUSES, WATCHLIST_TYPES } from '../watchlist.constants'

export class ListWatchlistDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @MaxLength(100)
  search?: string

  @IsIn(WATCHLIST_STATUSES)
  status: (typeof WATCHLIST_STATUSES)[number] = 'active'

  @IsIn([...WATCHLIST_TYPES, 'all'])
  listType: (typeof WATCHLIST_TYPES)[number] | 'all' = 'all'

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20

  // Last returned entry id; ordering is listed_at DESC, id DESC.
  @IsOptional()
  @IsUUID()
  cursor?: string
}
