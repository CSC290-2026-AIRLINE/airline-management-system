import { HttpStatus, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { draftAdjustment, type AdjustmentRefusal } from './domain/adjustment'
import { statementLines } from './domain/ledger-view'
import { effectiveTier } from './domain/tier'
import type { TierCode } from './domain/types'
import type { MemberDetailDto, MemberListItemDto } from './dto/responses'
import type { LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyError, invalid, isCheckViolation, memberNotFound } from './loyalty-error'
import { LoyaltyDataService, MEMBER_SELECT, memberName, type MemberRow } from './loyalty-data.service'

const REFUSAL_MESSAGE: Record<AdjustmentRefusal, [field: string, message: string]> = {
  not_integer: ['miles', 'Miles must be a whole number.'],
  zero_miles: ['miles', 'Enter miles to add or remove.'],
  blank_reason: ['reason', 'A reason is required.'],
  below_zero: ['miles', 'This would take the balance below 0.'],
}

const insufficientMiles = () =>
  new LoyaltyError(HttpStatus.CONFLICT, 'INSUFFICIENT_MILES', 'The balance changed and is now too low for this deduction.')

/** Staff Member Lookup: search, member detail with the full ledger, and manual adjustments. */
@Injectable()
export class LoyaltyStaffService {
  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly audit: AuditService,
    private readonly clock: SimulationClock,
  ) {}

  /**
   * Members whose number, name or email contains every word of `query` (case ignored), newest first, at most 25.
   * An empty query lists the 25 newest members.
   */
  async search(query: string | undefined): Promise<MemberListItemDto[]> {
    const words = (query ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5)
    const contains = (w: string) => ({ contains: w, mode: 'insensitive' as const })
    const where: Prisma.loyalty_memberWhereInput = {
      customer: { deleted_at: null },
      AND: words.map((w) => ({
        OR: [
          { member_number: contains(w) },
          { customer: { user: { email: contains(w) } } },
          { customer: { passenger: { first_name: contains(w) } } },
          { customer: { passenger: { last_name: contains(w) } } },
        ],
      })),
    }
    const [rows, rules] = await Promise.all([
      this.db.loyalty_member.findMany({ where, orderBy: { joined_at: 'desc' }, take: 25, select: MEMBER_SELECT }),
      this.data.tierRules(),
    ])
    const now = this.clock.now()
    return rows.map((m) => this.listItem(m, rules, now))
  }

  async detail(memberId: string): Promise<MemberDetailDto> {
    const member = await this.db.loyalty_member.findUnique({ where: { id: memberId }, select: MEMBER_SELECT })
    if (!member) throw memberNotFound()
    return this.toDetail(member)
  }

  /**
   * Adds or removes miles with a reason. The audit entry is written first, in the same transaction as the `adjust`
   * row that points at it, so neither exists without the other. The ledger trigger takes the member's row lock and
   * `miles_balance >= 0` refuses a deduction that a concurrent spend has made too large.
   */
  async adjust(staff: LoyaltyStaffPrincipal, memberId: string, miles: number, reason: string): Promise<MemberDetailDto> {
    const member = await this.db.loyalty_member.findUnique({
      where: { id: memberId },
      select: { id: true, member_number: true, miles_balance: true },
    })
    if (!member) throw memberNotFound()

    const now = this.clock.now()
    const settings = await this.data.settings()
    const result = draftAdjustment({ miles, reason, balance: member.miles_balance, now, retentionMonths: settings.milesRetentionMonths })
    if ('refusal' in result) {
      const [field, message] = REFUSAL_MESSAGE[result.refusal]
      if (result.refusal === 'below_zero') throw new LoyaltyError(HttpStatus.CONFLICT, 'INSUFFICIENT_MILES', message)
      throw invalid(field, message)
    }
    const { draft } = result

    try {
      await this.db.$transaction(async (tx) => {
        const entry = await this.audit.write(
          {
            actor: AuditService.staffActor({ id: staff.userId, roleCode: staff.roleCode }),
            sourceFeature: '11',
            action: 'update',
            entityType: 'loyalty_member',
            entityId: member.id,
            summary: `${draft.miles > 0 ? 'Added' : 'Removed'} ${Math.abs(draft.miles)} miles ${draft.miles > 0 ? 'to' : 'from'} ${member.member_number}`,
            reason: draft.reason,
            before: { miles_balance: member.miles_balance },
            after: { miles_balance: member.miles_balance + draft.miles },
            occurredAt: now,
          },
          tx,
        )
        await tx.loyalty_transaction.create({
          data: {
            member_id: member.id,
            type: 'adjust',
            miles: draft.miles,
            reason: draft.reason,
            expires_at: draft.expiresAt,
            audit_log_id: entry.id,
            created_by_staff_id: staff.staffId,
            occurred_at: now,
          },
          select: { id: true },
        })
      })
    } catch (error) {
      if (isCheckViolation(error)) throw insufficientMiles()
      throw error
    }
    return this.detail(member.id)
  }

  private listItem(m: MemberRow, rules: Awaited<ReturnType<LoyaltyDataService['tierRules']>>, now: Date): MemberListItemDto {
    const code = effectiveTier(
      { tierCode: m.tier_code as TierCode | null, tierQualifiedAt: m.tier_qualified_at, tierExpiresAt: m.tier_expires_at },
      now,
    )
    const rule = code ? rules.find((r) => r.code === code) : undefined
    return {
      id: m.id,
      memberNumber: m.member_number,
      name: memberName(m),
      email: m.customer.user.email,
      milesBalance: m.miles_balance,
      tier: rule ? { code: rule.code, name: rule.name } : null,
    }
  }

  private async toDetail(m: MemberRow): Promise<MemberDetailDto> {
    const now = this.clock.now()
    const [rules, settings, ledger] = await Promise.all([
      this.data.tierRules(),
      this.data.settings(),
      this.data.ledger(m.id, m.customer.passenger_id),
    ])
    const item = this.listItem(m, rules, now)
    return {
      ...item,
      customerId: m.customer_id,
      joinedAt: m.joined_at.toISOString(),
      tierExpiresAt: item.tier && m.tier_expires_at ? m.tier_expires_at.toISOString() : null,
      ledger: statementLines(ledger, now, settings.expiryReminderDays).map((l) => ({
        seq: l.seq,
        type: l.type,
        miles: l.miles,
        balanceAfter: l.balanceAfter,
        occurredAt: l.occurredAt,
        title: l.title,
        detail: l.detail,
      })),
    }
  }
}
