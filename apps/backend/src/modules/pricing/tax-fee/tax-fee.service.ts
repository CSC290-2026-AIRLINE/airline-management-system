import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { CreateTaxFeeDto } from './dto/create-tax-fee.dto'
import { UpdateTaxFeeDto } from './dto/update-tax-fee.dto'

@Injectable()
export class TaxFeeService {
  constructor(private readonly db: DbService) {}

  // The quote engine only applies active rows, so inactive ones are hidden unless asked for.
  findAll(includeInactive = false) {
    return this.db.tax_fee.findMany({
      where: { deleted_at: null, ...(includeInactive ? {} : { is_active: true }) },
      orderBy: { code: 'asc' },
    })
  }

  async findOne(id: string) {
    const taxFee = await this.db.tax_fee.findFirst({ where: { id, deleted_at: null } })
    if (!taxFee) {
      throw new NotFoundException(pricingError(PricingErrorCode.TAX_FEE_NOT_FOUND, `Tax or fee ${id} not found`))
    }
    return taxFee
  }

  async create(dto: CreateTaxFeeDto) {
    this.assertValueFitsCalcType(dto.calc_type, dto.value)
    await this.assertCodeFree(dto.code)
    try {
      return await this.db.tax_fee.create({ data: dto })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  async update(id: string, dto: UpdateTaxFeeDto) {
    const existing = await this.findOne(id)
    // Check the final combination: changing only calc_type to pct on a row worth 700 must fail too.
    this.assertValueFitsCalcType(dto.calc_type ?? existing.calc_type, dto.value ?? Number(existing.value))
    if (dto.code) {
      await this.assertCodeFree(dto.code, id)
    }
    try {
      return await this.db.tax_fee.update({ where: { id }, data: { ...dto, updated_at: new Date() } })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  // Soft delete: old quotes that list this tax keep their snapshot; the code can be reused afterwards.
  async remove(id: string) {
    await this.findOne(id)
    const now = new Date()
    await this.db.tax_fee.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  // The database only checks value >= 0, so a percentage over 100 has to be refused here.
  private assertValueFitsCalcType(calcType: string, value: number) {
    if (calcType === 'pct' && value > 100) {
      throw new BadRequestException(
        pricingError(PricingErrorCode.TAX_FEE_PCT_TOO_HIGH, `A percentage tax or fee cannot exceed 100 (got ${value})`),
      )
    }
  }

  private async assertCodeFree(code: string, excludeId?: string) {
    const existing = await this.db.tax_fee.findFirst({
      where: { code, deleted_at: null, ...(excludeId && { id: { not: excludeId } }) },
    })
    if (existing) {
      throw new ConflictException(pricingError(PricingErrorCode.TAX_FEE_CODE_TAKEN, `Tax code ${code} is already in use`))
    }
  }

  // Two requests can both pass assertCodeFree; the DB unique index catches the second one (P2002).
  private mapUniqueViolation(error: unknown, code?: string) {
    if (isUniqueViolation(error)) {
      return new ConflictException(pricingError(PricingErrorCode.TAX_FEE_CODE_TAKEN, `Tax code ${code} is already in use`))
    }
    return error
  }
}
