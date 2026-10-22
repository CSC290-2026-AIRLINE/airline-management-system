import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { CreateFareClassDto } from './dto/create-fare-class.dto'
import { UpdateFareClassDto } from './dto/update-fare-class.dto'


// fare services
@Injectable()
export class FareClassService {
  constructor(private readonly db: DbService) {}

  findAll(includeInactive = false) {
    return this.db.fare_class.findMany({
      where: { deleted_at: null, ...(includeInactive ? {} : { is_active: true }) },
      orderBy: { code: 'asc' },
    })
  }

  async findOne(id: string) {
    const fareClass = await this.db.fare_class.findFirst({ where: { id, deleted_at: null } })
    if (!fareClass) {
      throw new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, `Fare class ${id} not found`))
    }
    return fareClass
  }

  async create(dto: CreateFareClassDto) {
    await this.assertCodeFree(dto.code)
    try {
      return await this.db.fare_class.create({ data: dto })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  async update(id: string, dto: UpdateFareClassDto) {
    await this.findOne(id)
    if (dto.code) {
      await this.assertCodeFree(dto.code, id)
    }
    try {
      return await this.db.fare_class.update({ where: { id }, data: { ...dto, updated_at: new Date() } })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  // Soft delete: the row stays so old quotes and base fares that point at it still resolve.
  async remove(id: string) {
    await this.findOne(id)
    const now = new Date()
    await this.db.fare_class.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  private async assertCodeFree(code: string, excludeId?: string) {
    const existing = await this.db.fare_class.findFirst({
      where: { code, deleted_at: null, ...(excludeId && { id: { not: excludeId } }) },
    })
    if (existing) {
      throw new ConflictException(pricingError(PricingErrorCode.FARE_CLASS_CODE_TAKEN, `Fare class code ${code} is already in use`))
    }
  }

  // Two requests can both pass assertCodeFree; the DB unique index catches the second one (P2002).
  private mapUniqueViolation(error: unknown, code?: string) {
    if (isUniqueViolation(error)) {
      return new ConflictException(pricingError(PricingErrorCode.FARE_CLASS_CODE_TAKEN, `Fare class code ${code} is already in use`))
    }
    return error
  }
}
