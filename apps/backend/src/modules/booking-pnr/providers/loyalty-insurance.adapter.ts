import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { LoyaltyInsuranceService } from '@backend/modules/loyalty/loyalty-insurance.service'
import { LoyaltyMemberService } from '@backend/modules/loyalty/loyalty-member.service'
import type { InsuranceOffer, InsurancePolicySummary, InsurancePort } from '../contracts'

// Feature 11 states the member price of insurance in THB (loyalty_tier_benefit.insurance_price).
const MEMBER_PRICE_CURRENCY = 'THB'

/**
 * Travel insurance through feature 11's exported services. The benefit follows the booker: the tier of the customer's
 * own passenger profile. Feature 11 writes and cancels the policy; this adapter only asks.
 */
@Injectable()
export class LoyaltyInsuranceAdapter implements InsurancePort {
  constructor(
    private readonly db: DbService,
    private readonly members: LoyaltyMemberService,
    private readonly policies: LoyaltyInsuranceService,
  ) {}

  async offer(bookingId: string): Promise<InsuranceOffer> {
    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      select: { currency: true, payment_type: true, customer: { select: { passenger_id: true } } },
    })
    if (!booking) return { kind: 'none' }
    const tier = await this.members.tierForPassenger(booking.customer.passenger_id)
    if (tier.tierCode === null) return { kind: 'none' }
    const insurance = tier.benefits.insurance
    if (insurance.kind === 'included') return { kind: 'included', tierName: tier.name }
    // The add-on is paid by card with the booking, so it is offered only when the booking is in the price's currency.
    if (insurance.kind === 'member_price' && insurance.priceThb > 0 && booking.currency === MEMBER_PRICE_CURRENCY) {
      return { kind: 'member_price', tierName: tier.name, price: insurance.priceThb, currency: MEMBER_PRICE_CURRENCY }
    }
    return { kind: 'none' }
  }

  async issue(bookingId: string): Promise<InsurancePolicySummary | null> {
    const policy = await this.policies.issueInsurancePolicy(bookingId)
    return policy && { policyNumber: policy.policyNumber, price: policy.price, currency: policy.currency, status: policy.status }
  }

  async cancel(bookingId: string): Promise<InsurancePolicySummary | null> {
    const policy = await this.policies.cancelInsurancePolicy(bookingId)
    return policy && { policyNumber: policy.policyNumber, price: policy.price, currency: policy.currency, status: policy.status }
  }
}
