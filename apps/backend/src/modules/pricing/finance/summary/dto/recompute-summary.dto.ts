import { Matches } from 'class-validator'
import { MONTH_PATTERN } from '../../finance.constants'

const message = (field: string) => `${field} must look like 2026-11`

// Body for POST /staff/finance/recompute: the month range to rebuild, both ends included. One month: from = to.
export class RecomputeSummaryDto {
  @Matches(MONTH_PATTERN, { message: message('from') })
  from!: string

  @Matches(MONTH_PATTERN, { message: message('to') })
  to!: string
}
