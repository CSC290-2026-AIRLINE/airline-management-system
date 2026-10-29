import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { DATE_ONLY_PATTERN, EXPENSE_CATEGORIES, type ExpenseCategory } from '../../finance.constants'

// No status or paid_on: every schedule starts as 'scheduled', and only "mark paid" (step 3) changes them.
export class CreatePaymentScheduleDto {
  @IsIn(EXPENSE_CATEGORIES)
  category!: ExpenseCategory

  @IsString()
  @IsNotEmpty({ message: 'payee is required' })
  @MaxLength(200)
  payee!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  // NUMERIC(12, 2). No maxDecimalPlaces: it throws (a 500) on numbers JS prints in exponent form, such as 1e-7.
  @IsNumber()
  @Min(0.01, { message: 'amount must be greater than 0' })
  @Max(9_999_999_999.99)
  amount!: number

  // IsISO8601 strict rejects impossible dates such as 2026-02-30; the pattern rejects times.
  @Matches(DATE_ONLY_PATTERN, { message: 'due_date must be a date like 2026-11-30, with no time' })
  @IsISO8601({ strict: true })
  due_date!: string
}
