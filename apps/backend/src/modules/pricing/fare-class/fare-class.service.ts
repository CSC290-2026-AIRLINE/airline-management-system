import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FARE_RULE_FIELDS } from '../pricing.constants'
import { PricingAudit } from '../pricing.audit'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { CreateFareClassDto } from './dto/create-fare-class.dto'
import { UpdateFareClassDto } from './dto/update-fare-class.dto'
import { UpdateFareRuleDto } from './dto/update-fare-rule.dto'

type FareRuleField = (typeof FARE_RULE_FIELDS)[number]
// Fees come back from Prisma as Decimal; Number() reads both that and plain DTO numbers.
type FareRuleValues = Partial<Record<FareRuleField, unknown>>

const RULE_SELECT = { id: true, ...Object.fromEntries(FARE_RULE_FIELDS.map((field) => [field, true])) } as Record<
  'id' | FareRuleField,
  true
>

// The fare-rule columns of a full fare_class row, so the audit entry's before/after hold the same fields.
function pickRuleFields(row: FareRuleValues) {
  return Object.fromEntries(FARE_RULE_FIELDS.map((field) => [field, row[field]]))
}

// fare services
@Injectable()
export class FareClassService {
  constructor(
    private readonly db: DbService,
    private readonly audit: PricingAudit,
  ) {}

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

  async create(dto: CreateFareClassDto, userId: string) {
    this.assertRuleConsistent(dto)
    await this.assertCodeFree(dto.code)
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.fare_class.create({ data: dto })
        await this.audit.write(
          userId,
          { action: 'create', entityType: 'fare_class', entityId: row.id, summary: `Created fare class ${row.code}`, after: row },
          tx,
        )
        return row
      })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  async update(id: string, dto: UpdateFareClassDto, userId: string) {
    const current = await this.findOne(id)
    this.assertRuleConsistent({ ...current, ...dto })
    if (dto.code) {
      await this.assertCodeFree(dto.code, id)
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.fare_class.update({ where: { id }, data: { ...dto, updated_at: new Date() } })
        await this.audit.write(
          userId,
          {
            action: 'update',
            entityType: 'fare_class',
            entityId: id,
            summary: `Updated fare class ${row.code}`,
            before: current,
            after: row,
          },
          tx,
        )
        return row
      })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  async findRule(id: string) {
    const rule = await this.db.fare_class.findFirst({ where: { id, deleted_at: null }, select: RULE_SELECT })
    if (!rule) {
      throw new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, `Fare class ${id} not found`))
    }
    return rule
  }

  async updateRule(id: string, dto: UpdateFareRuleDto, userId: string) {
    const current = await this.findOne(id)
    this.assertRuleConsistent({ ...current, ...dto })
    return this.db.$transaction(async (tx) => {
      const row = await tx.fare_class.update({ where: { id }, data: { ...dto, updated_at: new Date() }, select: RULE_SELECT })
      await this.audit.write(
        userId,
        {
          action: 'update',
          entityType: 'fare_class',
          entityId: id,
          summary: `Updated fare rules of ${current.code}`,
          before: pickRuleFields(current),
          after: row,
        },
        tx,
      )
      return row
    })
  }

  // Soft delete: the row stays so old quotes and base fares that point at it still resolve.
  // A class that still has live base fares is refused, so it cannot vanish from staff lists while routes still sell it.
  async remove(id: string, userId: string) {
    const existing = await this.findOne(id)
    const liveBaseFares = await this.db.base_fare.count({ where: { fare_class_id: id, deleted_at: null } })
    if (liveBaseFares > 0) {
      throw new ConflictException(
        pricingError(PricingErrorCode.FARE_CLASS_IN_USE, `This fare class still has ${liveBaseFares} base fare(s); delete them first`, {
          base_fare_count: liveBaseFares,
        }),
      )
    }
    const now = new Date()
    await this.db.$transaction(async (tx) => {
      await tx.fare_class.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
      await this.audit.write(
        userId,
        { action: 'delete', entityType: 'fare_class', entityId: id, summary: `Deleted fare class ${existing.code}`, before: existing },
        tx,
      )
    })
  }

  // A cancel fee on a non-refundable class (or a change fee on a non-changeable one) would be frozen into quotes and
  // charged by refunds (5b) for an action the class does not allow, so it is refused. Checked on the merged row.
  private assertRuleConsistent(rule: FareRuleValues) {
    const fields: FareRuleField[] = []
    if (!rule.refundable) {
      fields.push(...(['cancel_fee_flat', 'cancel_fee_pct'] as const).filter((field) => Number(rule[field]) > 0))
    }
    if (!rule.changeable) {
      fields.push(...(['change_fee_flat', 'change_fee_pct'] as const).filter((field) => Number(rule[field]) > 0))
    }
    if (fields.length) {
      throw new BadRequestException(
        pricingError(PricingErrorCode.FARE_RULE_INVALID, 'Cancel fees need refundable = true and change fees need changeable = true', {
          fields,
        }),
      )
    }
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
