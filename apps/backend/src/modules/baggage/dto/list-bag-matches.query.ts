import { IsIn, IsOptional, IsUUID } from 'class-validator'
import { MATCH_STATUSES, type MatchStatus } from '../common/bag-match.types'

/** Query of `GET /api/staff/bag-matches`. Every filter is optional; filters combine with AND. */
export class ListBagMatchesQuery {
  @IsOptional()
  @IsIn(MATCH_STATUSES)
  status?: MatchStatus

  @IsOptional()
  @IsUUID()
  reportId?: string

  @IsOptional()
  @IsUUID()
  foundBagId?: string
}
