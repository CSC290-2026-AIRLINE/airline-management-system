import { IsOptional, Matches } from 'class-validator'
import { CURRENCY_CODE_PATTERN } from '../../currency-rate/currency-code.pipe'

export class DisplayCurrencyQueryDto {
  @IsOptional()
  @Matches(CURRENCY_CODE_PATTERN, { message: 'display_currency must be exactly 3 uppercase letters, e.g. USD' })
  display_currency?: string
}
