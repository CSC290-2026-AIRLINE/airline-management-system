import { IsIn, IsOptional, Matches } from 'class-validator'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../finance.constants'

// Query string for GET /staff/expenses, e.g. ?month=2026-11&category=staff
export class ListExpensesDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must look like 2026-11' })
  month?: string

  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: ExpenseCategory
}
