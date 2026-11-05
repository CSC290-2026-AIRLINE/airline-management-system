import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, pricingError } from '../pricing.errors'
import { staffIdFor } from '../pricing.staff'
import { SettingService } from '../setting/setting.service'
import { UpdateCurrencyRateDto } from './dto/update-currency-rate.dto'

// A Prisma Decimal or a plain number: both have toFixed.
type Numeric = number | { toFixed(decimalPlaces: number): string }

// Who last changed each rate, for the staff page.
const include = { staff: { select: { id: true, staff_code: true, first_name: true, last_name: true } } }

// Every stored amount is in pricing_setting 'base_currency'; a rate is how much of a currency one unit of it buys.
@Injectable()
export class CurrencyRateService {
  constructor(
    private readonly db: DbService,
    private readonly settings: SettingService,
  ) {}

  findAll() {
    return this.db.currency_rate.findMany({ include, orderBy: { currency_code: 'asc' } })
  }

  async findOne(code: string) {
    const rate = await this.db.currency_rate.findUnique({ where: { currency_code: code }, include })
    if (!rate) {
      throw new NotFoundException(pricingError(PricingErrorCode.CURRENCY_RATE_NOT_FOUND, `No rate for currency ${code}`))
    }
    return rate
  }

  // PUT adds the rate or replaces it. The code is the primary key, so an upsert can't create a duplicate.
  async upsert(code: string, dto: UpdateCurrencyRateDto, userId: string) {
    const base = await this.settings.getBaseCurrency()
    if (code === base) {
      throw new BadRequestException(pricingError(PricingErrorCode.CURRENCY_IS_BASE, `${base} is the base currency; its rate is always 1`))
    }
    const staffId = await staffIdFor(this.db, userId)
    return this.db.currency_rate.upsert({
      where: { currency_code: code },
      create: { currency_code: code, rate_per_base: dto.rate_per_base, updated_by: staffId },
      update: { rate_per_base: dto.rate_per_base, updated_by: staffId, updated_at: new Date() },
      include,
    })
  }

  // Converts an amount in the base currency, rounded half up to 2 decimal places. Exported for Feature 2.
  async convert(amount: Numeric, toCurrency: string): Promise<number> {
    if (toCurrency === (await this.settings.getBaseCurrency())) {
      return roundHalfUp(toScaled(amount, 6), 6)
    }
    const { rate_per_base } = await this.findOne(toCurrency)
    return multiply(amount, rate_per_base)
  }

  // The rate for showing a quote in the customer's currency, 1 for the base currency. Looked up on every read and never
  // stored, so a rate change shows on the next read. An unknown code is the caller's mistake: 400 CURRENCY_UNKNOWN,
  // unlike convert's 404 for staff.
  async displayRate(currency: string): Promise<DisplayRate> {
    if (currency === (await this.settings.getBaseCurrency())) {
      return { currency, rate_per_base: 1 }
    }
    const rate = await this.db.currency_rate.findUnique({ where: { currency_code: currency } })
    if (!rate) {
      throw new BadRequestException(
        pricingError(PricingErrorCode.CURRENCY_UNKNOWN, `No rate for currency ${currency}`, { display_currency: currency }),
      )
    }
    return { currency, rate_per_base: Number(rate.rate_per_base) }
  }
}

export interface DisplayRate {
  currency: string
  rate_per_base: number
}

// The fields a quote gains when the caller asks for display_currency.
export function displayFields(amount: Numeric, rate: DisplayRate) {
  return { display_currency: rate.currency, rate_per_base: rate.rate_per_base, display_total_amount: multiply(amount, rate.rate_per_base) }
}

function multiply(amount: Numeric, rate: Numeric): number {
  return roundHalfUp(toScaled(amount, 6) * toScaled(rate, 6), 12)
}

// Money math in integers, so 0.1 + 0.2 style float errors cannot change a rounded amount.
// toScaled(98.5, 2) = 9850n
function toScaled(value: Numeric, scale: number): bigint {
  const [whole, fraction = ''] = value.toFixed(scale).split('.')
  return BigInt(whole + fraction)
}

// Rounds a value with `scale` decimal places to 2, halves away from zero.
function roundHalfUp(scaled: bigint, scale: number): number {
  const divisor = 10n ** BigInt(scale - 2)
  const magnitude = scaled < 0n ? -scaled : scaled
  const cents = (magnitude + divisor / 2n) / divisor
  return Number(scaled < 0n ? -cents : cents) / 100
}
