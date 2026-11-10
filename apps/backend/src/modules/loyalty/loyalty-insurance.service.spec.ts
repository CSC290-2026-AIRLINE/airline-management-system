import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyError } from './loyalty-error'
import { LoyaltyInsuranceService } from './loyalty-insurance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-09T05:00:00Z')
const dec = (n: number) => ({ toString: () => String(n) })

const benefit = (tier_code: string, insurance_price: number | null) => ({
  tier_code,
  lounge_guests: null,
  extra_baggage_kg: dec(0),
  priority_checkin: false,
  priority_boarding: false,
  upgrade_eligible: false,
  insurance_price: insurance_price === null ? null : dec(insurance_price),
})

const booking = (tier: string | null, over: Record<string, unknown> = {}) => ({
  id: 'booking-1',
  status: 'confirmed',
  currency: 'THB',
  customer_id: 'cust-1',
  customer: {
    loyalty_member: {
      id: 'mem-1',
      tier_code: tier,
      tier_qualified_at: tier ? new Date('2026-10-01T00:00:00Z') : null,
      tier_expires_at: tier ? new Date('2027-10-01T00:00:00Z') : null,
    },
  },
  ...over,
})

const policy = (over: Record<string, unknown> = {}) => ({
  id: 'pol-1',
  policy_number: 'FLI10000001',
  booking_id: 'booking-1',
  price: dec(0),
  currency: 'THB',
  status: 'active',
  ...over,
})

function makeSvc() {
  const db = {
    booking: { findUnique: jest.fn().mockResolvedValue(booking('gold')) },
    loyalty_tier_benefit: { findMany: jest.fn().mockResolvedValue([benefit('silver', 190), benefit('gold', 0)]) },
    loyalty_insurance_policy: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: { price: number; currency: string } }) =>
          Promise.resolve(policy({ price: dec(data.price), currency: data.currency })),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment_line: { findFirst: jest.fn().mockResolvedValue(null) },
    pricing_setting: { findUnique: jest.fn().mockResolvedValue({ value: 'THB' }) },
  }
  const clock = new SimulationClock()
  jest.spyOn(clock, 'now').mockReturnValue(NOW)
  const dbService = db as unknown as DbService
  return { svc: new LoyaltyInsuranceService(dbService, new LoyaltyDataService(dbService), clock), db }
}

describe('LoyaltyInsuranceService', () => {
  describe('issueInsurancePolicy', () => {
    it('issues a free policy when the booker is Gold', async () => {
      const { svc, db } = makeSvc()
      expect(await svc.issueInsurancePolicy('booking-1')).toMatchObject({ price: 0, currency: 'THB', status: 'active' })
      expect(db.loyalty_insurance_policy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { member_id: 'mem-1', customer_id: 'cust-1', booking_id: 'booking-1', price: 0, currency: 'THB', issued_at: NOW },
        }),
      )
    })

    it('issues a paid policy for a Silver member who bought it at checkout', async () => {
      const { svc, db } = makeSvc()
      db.booking.findUnique.mockResolvedValueOnce(booking('silver'))
      db.payment_line.findFirst.mockResolvedValueOnce({
        amount: dec(190),
        refunded_amount: dec(0),
        payment_payment_line_payment_idTopayment: { currency: 'THB' },
      })
      expect(await svc.issueInsurancePolicy('booking-1')).toMatchObject({ price: 190 })
      const [{ where }] = db.payment_line.findFirst.mock.calls[0] as [{ where: Record<string, unknown> }]
      expect(where).toMatchObject({ line_type: 'insurance', source_ref: 'insurance:booking-1' })
    })

    it('issues nothing to a Silver member who did not buy it, or to a non-member', async () => {
      const { svc, db } = makeSvc()
      db.booking.findUnique.mockResolvedValueOnce(booking('silver'))
      expect(await svc.issueInsurancePolicy('booking-1')).toBeNull()
      db.booking.findUnique.mockResolvedValueOnce(booking(null, { customer: { loyalty_member: null } }))
      expect(await svc.issueInsurancePolicy('booking-1')).toBeNull()
      expect(db.loyalty_insurance_policy.create).not.toHaveBeenCalled()
    })

    it('returns the active policy on a repeat instead of writing a second one', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_insurance_policy.findFirst.mockResolvedValueOnce(policy())
      expect(await svc.issueInsurancePolicy('booking-1')).toMatchObject({ id: 'pol-1' })
      expect(db.loyalty_insurance_policy.create).not.toHaveBeenCalled()
    })

    it('refuses a booking that is not confirmed', async () => {
      const { svc, db } = makeSvc()
      db.booking.findUnique.mockResolvedValueOnce(booking('gold', { status: 'held' }))
      await expect(svc.issueInsurancePolicy('booking-1')).rejects.toBeInstanceOf(LoyaltyError)
    })

    it("uses 3b's transaction client when given one", async () => {
      const { svc, db } = makeSvc()
      const tx = { ...db, booking: { findUnique: jest.fn().mockResolvedValue(booking('gold')) } }
      await svc.issueInsurancePolicy('booking-1', tx as never)
      expect(tx.booking.findUnique).toHaveBeenCalled()
      expect(db.booking.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('cancelInsurancePolicy', () => {
    it('cancels the active policy and answers it for the refund', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_insurance_policy.findFirst.mockResolvedValueOnce(policy({ price: dec(190) }))
      expect(await svc.cancelInsurancePolicy('booking-1')).toMatchObject({ status: 'cancelled', price: 190 })
      expect(db.loyalty_insurance_policy.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pol-1', status: 'active' },
          data: expect.objectContaining({ status: 'cancelled', cancelled_at: NOW }),
        }),
      )
    })

    it('answers null when there is nothing to cancel', async () => {
      const { svc } = makeSvc()
      expect(await svc.cancelInsurancePolicy('booking-1')).toBeNull()
    })
  })
})
