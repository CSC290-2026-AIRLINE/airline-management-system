import { IsNumber, Matches, Max, Min } from 'class-validator'
import { CURRENCY_CODE_PATTERN } from '../currency-code.pipe'

export class CreateCurrencyRateDto {
  @Matches(CURRENCY_CODE_PATTERN, { message: 'currency_code must be exactly 3 uppercase letters, e.g. USD' })
  currency_code!: string

  // Units of this currency per 1 unit of the base currency. The column is NUMERIC(14, 6), so the database rounds extra
  // decimals. No maxDecimalPlaces: it throws (a 500) on numbers JS prints in exponent form, such as 1e-7.
  @IsNumber()
  @Min(0.000001, { message: 'rate_per_base must be greater than 0 (at least 0.000001)' })
  @Max(99_999_999)
  rate_per_base!: number
}
