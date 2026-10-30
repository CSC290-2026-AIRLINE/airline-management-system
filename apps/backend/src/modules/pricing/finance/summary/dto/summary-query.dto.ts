import { IsOptional, Matches } from 'class-validator'
import { MONTH_PATTERN } from '../../finance.constants'

const message = (field: string) => `${field} must look like 2026-11`

// Query string for GET /staff/finance/summary: either ?month=2026-11, or ?from=2026-01&to=2026-12 (both ends included).
export class SummaryQueryDto {
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: message('month') })
  month?: string

  @IsOptional()
  @Matches(MONTH_PATTERN, { message: message('from') })
  from?: string

  @IsOptional()
  @Matches(MONTH_PATTERN, { message: message('to') })
  to?: string
}
