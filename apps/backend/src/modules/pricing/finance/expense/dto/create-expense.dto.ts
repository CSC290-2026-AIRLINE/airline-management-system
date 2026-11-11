import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { DATE_ONLY_PATTERN, EXPENSE_CATEGORIES, type ExpenseCategory } from '../../finance.constants'

// A manual expense, for costs that never had a schedule. No payment_schedule_id: only "mark paid" sets it.
export class CreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES)
  category!: ExpenseCategory

  @IsString()
  @IsNotEmpty({ message: 'description is required' })
  @MaxLength(500)
  description!: string

  // NUMERIC(12, 2). No maxDecimalPlaces: it throws (a 500) on numbers JS prints in exponent form, such as 1e-7.
  @IsNumber()
  @Min(0.01, { message: 'amount must be greater than 0' })
  @Max(9_999_999_999.99)
  amount!: number

  // Decides which month the expense counts in.
  @Matches(DATE_ONLY_PATTERN, { message: 'incurred_on must be a date like 2026-11-30, with no time' })
  @IsISO8601({ strict: true })
  incurred_on!: string
}
