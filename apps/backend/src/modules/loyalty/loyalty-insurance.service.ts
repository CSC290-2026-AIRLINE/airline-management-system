import { HttpStatus, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { policyTerms, type PaidInsurance } from './domain/insurance'
import { effectiveTier } from './domain/tier'
import type { TierCode } from './domain/types'
import type { InsurancePolicyDto } from './dto/responses'
import { LoyaltyError, isUniqueViolation } from './loyalty-error'
import { LoyaltyDataService } from './loyalty-data.service'

type Client = DbService | Prisma.TransactionClient

const POLICY_SELECT = {
  id: true,
  policy_number: true,
  booking_id: true,
  price: true,
  currency: true,
  status: true,
} satisfies Prisma.loyalty_insurance_policySelect

type PolicyRow = Prisma.loyalty_insurance_policyGetPayload<{ select: typeof POLICY_SELECT }>

const toDto = (p: PolicyRow): InsurancePolicyDto => ({
  id: p.id,
  policyNumber: p.policy_number,
  bookingId: p.booking_id,
  price: Number(p.price.toString()),
  currency: p.currency,
  status: p.status as InsurancePolicyDto['status'],
})

/**
 * Travel insurance policies, called in process by feature 3b (never over HTTP). Both methods take 3b's transaction
 * client, so the policy is written or cancelled in the same transaction that confirms or cancels the booking. A
 * record only: no real insurer is called.
 */
@Injectable()
export class LoyaltyInsuranceService {
  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly clock: SimulationClock,
  ) {}

  /**
   * Writes the policy for a confirmed booking whose booker is a member, covering every passenger on it: free when the
   * booker's tier includes insurance, at the captured price when the booker added it at checkout (feature 5a's
   * `insurance:<booking id>` line). Answers null when the booking gets no policy. Safe to repeat: an active policy
   * already on the booking is returned as it is.
   */
  async issueInsurancePolicy(bookingId: string, client: Client = this.db): Promise<InsurancePolicyDto | null> {
    const booking = await client.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        currency: true,
        customer_id: true,
        customer: { select: { loyalty_member: { select: { id: true, tier_code: true, tier_qualified_at: true, tier_expires_at: true } } } },
      },
    })
    if (!booking) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'No booking with that id.')
    if (booking.status !== 'confirmed') {
      throw new LoyaltyError(HttpStatus.CONFLICT, 'BOOKING_NOT_CONFIRMED', 'A policy is issued only for a confirmed booking.')
    }

    const existing = await this.activePolicy(bookingId, client)
    if (existing) return toDto(existing)

    const member = booking.customer.loyalty_member
    if (!member) return null

    const now = this.clock.now()
    const code = effectiveTier(
      { tierCode: member.tier_code as TierCode | null, tierQualifiedAt: member.tier_qualified_at, tierExpiresAt: member.tier_expires_at },
      now,
    )
    const [benefits, paid, baseCurrency] = await Promise.all([
      code ? this.data.tierBenefits(client) : Promise.resolve(new Map()),
      this.paidInsurance(bookingId, client),
      this.baseCurrency(client, booking.currency),
    ])
    const terms = policyTerms(code ? (benefits.get(code)?.insurance ?? null) : null, paid, baseCurrency)
    if (!terms) return null

    try {
      const policy = await client.loyalty_insurance_policy.create({
        data: {
          member_id: member.id,
          customer_id: booking.customer_id,
          booking_id: bookingId,
          price: terms.price,
          currency: terms.currency,
          issued_at: now,
        },
        select: POLICY_SELECT,
      })
      return toDto(policy)
    } catch (error) {
      // A concurrent confirm already issued it (one active policy per booking).
      if (!isUniqueViolation(error)) throw error
      const winner = await this.activePolicy(bookingId, client)
      if (!winner) throw error
      return toDto(winner)
    }
  }

  /**
   * Cancels the booking's active policy when 3b cancels the booking, and answers it so 5b can refund a paid price.
   * Null when the booking has no active policy. Safe to repeat.
   */
  async cancelInsurancePolicy(bookingId: string, client: Client = this.db): Promise<InsurancePolicyDto | null> {
    const active = await this.activePolicy(bookingId, client)
    if (!active) return null
    const now = this.clock.now()
    const { count } = await client.loyalty_insurance_policy.updateMany({
      where: { id: active.id, status: 'active' },
      data: { status: 'cancelled', cancelled_at: now, updated_at: new Date() },
    })
    if (count === 0) return null // cancelled by a concurrent call
    return toDto({ ...active, status: 'cancelled' })
  }

  private activePolicy(bookingId: string, client: Client): Promise<PolicyRow | null> {
    return client.loyalty_insurance_policy.findFirst({ where: { booking_id: bookingId, status: 'active' }, select: POLICY_SELECT })
  }

  /** The insurance line of a captured payment for this booking, if the booker bought cover at checkout. */
  private async paidInsurance(bookingId: string, client: Client): Promise<PaidInsurance | null> {
    const line = await client.payment_line.findFirst({
      where: {
        line_type: 'insurance',
        source_ref: `insurance:${bookingId}`,
        payment_payment_line_payment_idTopayment: { status: 'captured', booking_id: bookingId },
      },
      orderBy: { created_at: 'desc' },
      select: { amount: true, refunded_amount: true, payment_payment_line_payment_idTopayment: { select: { currency: true } } },
    })
    if (!line) return null
    const amount = Number(line.amount.toString()) - Number(line.refunded_amount.toString())
    return { amount, currency: line.payment_payment_line_payment_idTopayment.currency }
  }

  /** Feature 4's pricing_setting 'base_currency', or the booking's currency when the setting is missing. */
  private async baseCurrency(client: Client, fallback: string): Promise<string> {
    const row = await client.pricing_setting.findUnique({ where: { key: 'base_currency' }, select: { value: true } })
    return row?.value || fallback
  }
}
