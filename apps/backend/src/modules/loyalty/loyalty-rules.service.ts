import { HttpStatus, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { AuditService, type AuditWriteInput } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import {
  benefitsToRow,
  isSettingKey,
  normaliseMultiplier,
  settingField,
  validateBenefits,
  validateSetting,
  validateTierRule,
  type TierRulePatch,
} from './domain/rules'
import type { LoyaltySettings, TierBenefits, TierRule } from './domain/types'
import type { EarnRuleDto, TierInfoDto } from './dto/responses'
import type { LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyError, invalid } from './loyalty-error'
import { LoyaltyDataService } from './loyalty-data.service'

const tierNotFound = () => new LoyaltyError(HttpStatus.NOT_FOUND, 'TIER_NOT_FOUND', 'No tier with that code.')

/**
 * Loyalty Rules (also edited through feature 15): tier rules, earn multipliers, settings and tier benefits. There is
 * no create or delete — the tiers and settings come with the migration. Every change writes an `update` row to the
 * audit log in the same transaction, with the values before and after.
 */
@Injectable()
export class LoyaltyRulesService {
  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly audit: AuditService,
    private readonly clock: SimulationClock,
  ) {}

  tiers(): Promise<TierInfoDto[]> {
    return this.data.tiers()
  }

  tierRules(): Promise<TierRule[]> {
    return this.data.tierRules()
  }

  async updateTierRule(staff: LoyaltyStaffPrincipal, code: string, patch: TierRulePatch): Promise<TierRule> {
    const rules = await this.data.tierRules()
    const before = rules.find((r) => r.code === code)
    if (!before) throw tierNotFound()
    const refusal = validateTierRule(code, patch, rules)
    if (refusal) throw invalid(refusal.field, refusal.message)

    await this.db.$transaction(async (tx) => {
      await tx.loyalty_tier_rule.update({
        where: { code },
        data: {
          min_miles: patch.minMiles,
          min_flights: patch.minFlights,
          valid_months: patch.validMonths,
          updated_by_staff_id: staff.staffId,
          updated_at: new Date(),
        },
      })
      await this.log(tx, staff, 'loyalty_tier_rule', code, `Updated the ${before.name} tier rule`, pickRule(before), patch)
    })
    return { ...before, ...patch }
  }

  /** Every live feature 4 fare class with its multiplier; a class with no rule shows "0.00" and earns nothing. */
  async earnRules(): Promise<EarnRuleDto[]> {
    const classes = await this.db.fare_class.findMany({
      where: { deleted_at: null },
      orderBy: [{ cabin: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, cabin: true, loyalty_earn_rule: { select: { multiplier: true } } },
    })
    return classes.map((c) => ({
      fareClassId: c.id,
      fareClassCode: c.code,
      fareClassName: c.name,
      cabin: c.cabin,
      multiplier: c.loyalty_earn_rule ? c.loyalty_earn_rule.multiplier.toFixed(2) : '0.00',
    }))
  }

  async setEarnRule(staff: LoyaltyStaffPrincipal, fareClassId: string, text: string): Promise<EarnRuleDto> {
    const multiplier = normaliseMultiplier(text)
    if (multiplier === null) throw invalid('multiplier', 'Enter a multiplier from 0 to 99.99, e.g. 1.25.')
    const fareClass = await this.db.fare_class.findFirst({
      where: { id: fareClassId, deleted_at: null },
      select: { id: true, code: true, name: true, cabin: true, loyalty_earn_rule: { select: { multiplier: true } } },
    })
    if (!fareClass) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'FARE_CLASS_NOT_FOUND', 'No fare class with that id.')
    const before = fareClass.loyalty_earn_rule ? fareClass.loyalty_earn_rule.multiplier.toFixed(2) : null

    await this.db.$transaction(async (tx) => {
      await tx.loyalty_earn_rule.upsert({
        where: { fare_class_id: fareClassId },
        create: { fare_class_id: fareClassId, multiplier, updated_by_staff_id: staff.staffId },
        update: { multiplier, updated_by_staff_id: staff.staffId, updated_at: new Date() },
      })
      await this.log(
        tx,
        staff,
        'loyalty_earn_rule',
        fareClassId,
        `Set the ${fareClass.code} miles multiplier to ${multiplier}`,
        { multiplier: before },
        { multiplier },
      )
    })
    return { fareClassId, fareClassCode: fareClass.code, fareClassName: fareClass.name, cabin: fareClass.cabin, multiplier }
  }

  settings(): Promise<LoyaltySettings> {
    return this.data.settings()
  }

  async updateSetting(staff: LoyaltyStaffPrincipal, key: string, value: number): Promise<LoyaltySettings> {
    if (!isSettingKey(key)) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'SETTING_NOT_FOUND', 'No setting with that key.')
    const refusal = validateSetting(key, value)
    if (refusal) throw invalid(refusal.field, refusal.message)
    const before = await this.data.settings()

    await this.db.$transaction(async (tx) => {
      await tx.loyalty_setting.upsert({
        where: { key },
        create: { key, value: String(value), updated_by: staff.staffId },
        update: { value: String(value), updated_by: staff.staffId, updated_at: new Date() },
      })
      await this.log(tx, staff, 'loyalty_setting', key, `Set ${key} to ${value}`, { value: before[settingField(key)] }, { value })
    })
    return { ...before, [settingField(key)]: value }
  }

  async updateTierBenefits(staff: LoyaltyStaffPrincipal, code: string, benefits: TierBenefits): Promise<TierBenefits> {
    const rule = await this.db.loyalty_tier_rule.findUnique({ where: { code }, select: { name: true } })
    if (!rule) throw tierNotFound()
    const refusal = validateBenefits(benefits)
    if (refusal) throw invalid(refusal.field, refusal.message)
    const before = (await this.data.tierBenefits()).get(code) ?? null
    const row = benefitsToRow(benefits)

    await this.db.$transaction(async (tx) => {
      await tx.loyalty_tier_benefit.upsert({
        where: { tier_code: code },
        create: { tier_code: code, ...row, updated_by_staff_id: staff.staffId },
        update: { ...row, updated_by_staff_id: staff.staffId, updated_at: new Date() },
      })
      await this.log(tx, staff, 'loyalty_tier_benefit', code, `Updated the ${rule.name} tier benefits`, before, benefits)
    })
    return benefits
  }

  private log(
    tx: Prisma.TransactionClient,
    staff: LoyaltyStaffPrincipal,
    entityType: string,
    entityId: string,
    summary: string,
    before: AuditWriteInput['before'],
    after: AuditWriteInput['after'],
  ) {
    return this.audit.write(
      {
        actor: AuditService.staffActor({ id: staff.userId, roleCode: staff.roleCode }),
        sourceFeature: '11',
        action: 'update',
        entityType,
        entityId,
        summary,
        before,
        after,
        occurredAt: this.clock.now(),
      },
      tx,
    )
  }
}

const pickRule = (r: TierRule): TierRulePatch => ({ minMiles: r.minMiles, minFlights: r.minFlights, validMonths: r.validMonths })
