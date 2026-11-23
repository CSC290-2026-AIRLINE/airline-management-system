import { PickType } from '@nestjs/mapped-types'
import { CreateCurrencyRateDto } from './create-currency-rate.dto'

// The code is the primary key, so only the rate can change.
export class UpdateCurrencyRateDto extends PickType(CreateCurrencyRateDto, ['rate_per_base'] as const) {}
