import type { TransactionType } from './api/types'

export const STATEMENT_TYPES = ['earn', 'redeem', 'redeem_reversal', 'expire', 'adjust'] as const satisfies readonly TransactionType[]

// The Statement's filters, kept in the URL (?type=redeem&range=12m or &from=…&to=…).
export interface StatementSearch {
  type?: TransactionType
  range?: '12m' | 'all'
  from?: string // yyyy-mm-dd; only for a custom range
  to?: string
}
