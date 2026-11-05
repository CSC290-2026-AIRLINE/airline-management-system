import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { RULE_GROUPS, RULE_GROUP_FIELDS, type RuleConditionField, type RuleGroup } from '../pricing.constants'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto'
import { ListPricingRulesDto } from './dto/list-pricing-rules.dto'
import { ReorderPricingRulesDto } from './dto/reorder-pricing-rules.dto'
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto'
import { applyMatchingRules, dateOnly, type RuleContext, type RuleResult } from './pricing-rule.engine'

// Enough of the fare class for a staff list to show "Y · Economy Saver" next to a class-specific rule.
const INCLUDE_LABELS = { fare_class: { select: { code: true, name: true } } } as const

// Shift applied to every priority of a group before writing the new order, so no step collides on the unique index.
const REORDER_OFFSET = 1000

// The condition columns of a rule as plain values: numbers and YYYY-MM-DD strings, whether they came from a DTO or a row.
type Conditions = Record<RuleConditionField, number | string | null>

const ALL_CONDITION_FIELDS: readonly RuleConditionField[] = Object.values(RULE_GROUP_FIELDS).flat()

function conditionsOf(row: Partial<Record<RuleConditionField, unknown>>): Conditions {
  const conditions = {} as Conditions
  for (const field of ALL_CONDITION_FIELDS) {
    const value = row[field]
    conditions[field] =
      value === undefined || value === null
        ? null
        : value instanceof Date
          ? dateOnly(value)
          : typeof value === 'string'
            ? value
            : Number(value)
  }
  return conditions
}

// DTO dates are YYYY-MM-DD; @db.Date columns take a Date at UTC midnight. undefined stays undefined (= not changed).
function toDbDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined || value === null ? value : new Date(`${value}T00:00:00.000Z`)
}

@Injectable()
export class PricingRuleService {
  constructor(private readonly db: DbService) {}

  // Sorted the way the engine applies them: urgency → load → month → period, then by priority.
  async findAll(filter: ListPricingRulesDto = {}) {
    const rules = await this.db.pricing_rule.findMany({
      where: {
        deleted_at: null,
        ...(filter.rule_group && { rule_group: filter.rule_group }),
        ...(filter.active_only === 'true' && { is_active: true }),
      },
      include: INCLUDE_LABELS,
      orderBy: { priority: 'asc' },
    })
    return rules.sort((a, b) => groupIndex(a.rule_group) - groupIndex(b.rule_group))
  }

  async findOne(id: string) {
    const rule = await this.db.pricing_rule.findFirst({ where: { id, deleted_at: null }, include: INCLUDE_LABELS })
    if (!rule) {
      throw new NotFoundException(pricingError(PricingErrorCode.PRICING_RULE_NOT_FOUND, `Pricing rule ${id} not found`))
    }
    return rule
  }

  async create(dto: CreatePricingRuleDto) {
    this.assertConditions(dto.rule_group, conditionsOf(dto))
    if (dto.fare_class_id) {
      await this.assertFareClassLive(dto.fare_class_id)
    }
    const priority = dto.priority ?? (await this.nextPriority(dto.rule_group))
    await this.assertPriorityFree(dto.rule_group, priority)
    try {
      return await this.db.pricing_rule.create({
        data: { ...dto, priority, start_date: toDbDate(dto.start_date), end_date: toDbDate(dto.end_date) },
        include: INCLUDE_LABELS,
      })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.rule_group, priority)
    }
  }

  async update(id: string, dto: UpdatePricingRuleDto) {
    const current = await this.findOne(id)
    const group = current.rule_group as RuleGroup
    // Checked on the row as it will be after the change, so a PATCH cannot leave it half-valid.
    this.assertConditions(group, { ...conditionsOf(current), ...conditionsOfSent(dto) })
    if (dto.fare_class_id) {
      await this.assertFareClassLive(dto.fare_class_id)
    }
    if (dto.priority !== undefined && dto.priority !== current.priority) {
      await this.assertPriorityFree(group, dto.priority, id)
    }
    try {
      return await this.db.pricing_rule.update({
        where: { id },
        data: { ...dto, start_date: toDbDate(dto.start_date), end_date: toDbDate(dto.end_date), updated_at: new Date() },
        include: INCLUDE_LABELS,
      })
    } catch (error) {
      throw this.mapUniqueViolation(error, group, dto.priority)
    }
  }

  // Soft delete. The gap left in the priorities is harmless; quotes already made keep their own rule lines.
  async remove(id: string) {
    await this.findOne(id)
    const now = new Date()
    await this.db.pricing_rule.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  // Writes priorities 1, 2, 3… in the order of `ids`. A direct swap would collide on the (rule_group, priority) unique
  // index, so in one transaction every live rule of the group is first moved up by REORDER_OFFSET, then given its slot.
  async reorder({ rule_group, ids }: ReorderPricingRulesDto) {
    const live = await this.db.pricing_rule.findMany({ where: { rule_group, deleted_at: null }, select: { id: true } })
    const liveIds = new Set(live.map((rule) => rule.id))
    const missing = [...liveIds].filter((id) => !ids.includes(id))
    const unknown = ids.filter((id) => !liveIds.has(id))
    if (missing.length || unknown.length) {
      throw new BadRequestException(
        pricingError(PricingErrorCode.PRICING_RULE_REORDER_MISMATCH, `ids must list every live ${rule_group} rule exactly once`, {
          missing,
          unknown,
        }),
      )
    }

    const now = new Date()
    await this.db.$transaction([
      this.db.pricing_rule.updateMany({ where: { rule_group, deleted_at: null }, data: { priority: { increment: REORDER_OFFSET } } }),
      ...ids.map((id, index) => this.db.pricing_rule.update({ where: { id }, data: { priority: index + 1, updated_at: now } })),
    ])
    return this.findAll({ rule_group })
  }

  // Used by fare quotes. Loads the live, active rules that can apply to this fare class and runs the engine on them.
  // No cap on the combined multiplier: each rule is bounded by the DB (-99.99% to +9999.99%) and staff set the values.
  async applyRules(baseAmount: number, context: RuleContext): Promise<RuleResult> {
    const rules = await this.db.pricing_rule.findMany({
      where: { deleted_at: null, is_active: true, OR: [{ fare_class_id: null }, { fare_class_id: context.fareClassId }] },
      orderBy: { priority: 'asc' },
    })
    return applyMatchingRules(rules, baseAmount, context)
  }

  // A rule fills only its own group's condition columns, has at least the condition its group needs, and keeps
  // min <= max. The DB CHECKs cover part of this; checking here first gives a 400 that names the fields.
  private assertConditions(group: RuleGroup, conditions: Conditions) {
    const own = RULE_GROUP_FIELDS[group] as readonly RuleConditionField[]
    const problems: string[] = []
    const fields = new Set<RuleConditionField>()
    const flag = (message: string, ...names: RuleConditionField[]) => {
      problems.push(message)
      names.forEach((name) => fields.add(name))
    }

    const foreign = ALL_CONDITION_FIELDS.filter((field) => !own.includes(field) && conditions[field] !== null)
    if (foreign.length) flag(`a ${group} rule cannot set ${foreign.join(', ')}`, ...foreign)

    const { min_days_out, max_days_out, min_seats_left_pct, max_seats_left_pct, month, start_date, end_date } = conditions
    switch (group) {
      case 'urgency':
        if (min_days_out === null && max_days_out === null) flag('set min_days_out, max_days_out or both', 'min_days_out', 'max_days_out')
        else if (min_days_out !== null && max_days_out !== null && min_days_out > max_days_out)
          flag('min_days_out must be <= max_days_out', 'min_days_out', 'max_days_out')
        break
      case 'load':
        if (min_seats_left_pct === null && max_seats_left_pct === null)
          flag('set min_seats_left_pct, max_seats_left_pct or both', 'min_seats_left_pct', 'max_seats_left_pct')
        else if (min_seats_left_pct !== null && max_seats_left_pct !== null && min_seats_left_pct > max_seats_left_pct)
          flag('min_seats_left_pct must be <= max_seats_left_pct', 'min_seats_left_pct', 'max_seats_left_pct')
        break
      case 'month':
        if (month === null) flag('a month rule needs month (1-12)', 'month')
        break
      case 'period':
        if (start_date === null || end_date === null) flag('a period rule needs start_date and end_date', 'start_date', 'end_date')
        else if (start_date > end_date) flag('start_date must be on or before end_date', 'start_date', 'end_date')
        break
      default: {
        const unknown: never = group
        throw new Error(`Unknown rule group ${String(unknown)}`)
      }
    }

    if (problems.length) {
      throw new BadRequestException(pricingError(PricingErrorCode.PRICING_RULE_INVALID, problems.join('; '), { fields: [...fields] }))
    }
  }

  private async nextPriority(group: RuleGroup) {
    const { _max } = await this.db.pricing_rule.aggregate({ where: { rule_group: group, deleted_at: null }, _max: { priority: true } })
    return (_max.priority ?? 0) + 1
  }

  private async assertPriorityFree(group: RuleGroup, priority: number, excludeId?: string) {
    const existing = await this.db.pricing_rule.findFirst({
      where: { rule_group: group, priority, deleted_at: null, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    })
    if (existing) {
      throw this.priorityTaken(group, priority, existing.id)
    }
  }

  private async assertFareClassLive(fareClassId: string) {
    const fareClass = await this.db.fare_class.findFirst({ where: { id: fareClassId, deleted_at: null }, select: { id: true } })
    if (!fareClass) {
      throw new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, `Fare class ${fareClassId} not found`))
    }
  }

  // Two requests can both pass assertPriorityFree; the partial unique index catches the second one (P2002).
  private mapUniqueViolation(error: unknown, group: RuleGroup, priority?: number) {
    return isUniqueViolation(error) ? this.priorityTaken(group, priority) : error
  }

  private priorityTaken(group: RuleGroup, priority?: number, existingId?: string) {
    return new ConflictException(
      pricingError(
        PricingErrorCode.PRICING_RULE_PRIORITY_TAKEN,
        `Another ${group} rule already has priority ${priority ?? 'this priority'}; use reorder to move rules`,
        existingId ? { pricing_rule_id: existingId } : undefined,
      ),
    )
  }
}

function groupIndex(group: string): number {
  return (RULE_GROUPS as readonly string[]).indexOf(group)
}

// Only the condition fields the client actually sent; null (clear) counts as sent.
function conditionsOfSent(dto: UpdatePricingRuleDto): Partial<Conditions> {
  const sent = conditionsOf(dto)
  return Object.fromEntries(ALL_CONDITION_FIELDS.filter((field) => dto[field] !== undefined).map((field) => [field, sent[field]]))
}
