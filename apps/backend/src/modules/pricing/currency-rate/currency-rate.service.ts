import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { staffIdFor } from '../pricing.staff'
import { CreateCurrencyRateDto } from './dto/create-currency-rate.dto'
import { UpdateCurrencyRateDto } from './dto/update-currency-rate.dto'

// TODO: read pricing_setting 'base_currency' once Core's settings module exists. Every stored amount is in this currency.
export const BASE_CURRENCY = 'THB'

// A Prisma Decimal or a plain number: both have toFixed.
type Numeric = number | { toFixed(decimalPlaces: number): string }

// Who last changed each rate, for the staff page.
const include = { staff: { select: { id: true, staff_code: true, first_name: true, last_name: true } } }

@Injectable()
export class CurrencyRateService {
  constructor(private readonly db: DbService) {}

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

  async create(dto: CreateCurrencyRateDto, userId: string) {
    if (dto.currency_code === BASE_CURRENCY) {
      throw new BadRequestException(
        pricingError(PricingErrorCode.CURRENCY_IS_BASE, `${BASE_CURRENCY} is the base currency; its rate is always 1`),
      )
    }
    const staffId = await staffIdFor(this.db, userId)
    const existing = await this.db.currency_rate.findUnique({ where: { currency_code: dto.currency_code } })
    if (existing) {
      throw this.codeTaken(dto.currency_code)
    }
    try {
      return await this.db.currency_rate.create({ data: { ...dto, updated_by: staffId }, include })
    } catch (error) {
      // Two requests can both pass the check above; the primary key catches the second one (P2002).
      throw isUniqueViolation(error) ? this.codeTaken(dto.currency_code) : error
    }
  }

  async update(code: string, dto: UpdateCurrencyRateDto, userId: string) {
    await this.findOne(code)
    const staffId = await staffIdFor(this.db, userId)
    return this.db.currency_rate.update({
      where: { currency_code: code },
      data: { ...dto, updated_by: staffId, updated_at: new Date() },
      include,
    })
  }

  // Converts an amount in the base currency, rounded half up to 2 decimal places. Exported for Feature 2.
  async convert(amount: Numeric, toCurrency: string): Promise<number> {
    if (toCurrency === BASE_CURRENCY) {
      return roundHalfUp(toScaled(amount, 6), 6)
    }
    const { rate_per_base } = await this.findOne(toCurrency)
    return roundHalfUp(toScaled(amount, 6) * toScaled(rate_per_base, 6), 12)
  }

  private codeTaken(code: string) {
    return new ConflictException(pricingError(PricingErrorCode.CURRENCY_CODE_TAKEN, `Currency ${code} already has a rate`))
  }
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
