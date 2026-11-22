import { LoyaltyInsuranceAdapter } from './loyalty-insurance.adapter'

// The real DbService and feature 11's clock load ESM config modules Jest cannot require; the tests pass their own stubs.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/simulation-clock', () => ({ SimulationClock: class {} }))

const BENEFITS = { loungeGuests: null, extraBaggageKg: 0, priorityCheckIn: false, priorityBoarding: false, upgradeEligible: false }

function setup(booking: { currency: string } | null, tier: unknown) {
  const db = {
    booking: {
      findUnique: jest.fn().mockResolvedValue(booking && { ...booking, payment_type: 'cash', customer: { passenger_id: 'pax-1' } }),
    },
  }
  const members = { tierForPassenger: jest.fn().mockResolvedValue(tier) }
  const policies = {
    issueInsurancePolicy: jest.fn().mockResolvedValue({ policyNumber: 'P1', price: 0, currency: 'THB', status: 'active' }),
    cancelInsurancePolicy: jest.fn().mockResolvedValue(null),
  }
  return { adapter: new LoyaltyInsuranceAdapter(db as never, members as never, policies as never), members, policies }
}

describe('LoyaltyInsuranceAdapter', () => {
  it('offers insurance included in the tier, read from the booker’s own passenger profile', async () => {
    const h = setup({ currency: 'THB' }, { tierCode: 'gold', name: 'Gold', benefits: { ...BENEFITS, insurance: { kind: 'included' } } })
    await expect(h.adapter.offer('b-1')).resolves.toEqual({ kind: 'included', tierName: 'Gold' })
    expect(h.members.tierForPassenger).toHaveBeenCalledWith('pax-1')
  })

  it('offers the member price as an add-on only for a THB booking', async () => {
    const tier = { tierCode: 'silver', name: 'Silver', benefits: { ...BENEFITS, insurance: { kind: 'member_price', priceThb: 350 } } }
    await expect(setup({ currency: 'THB' }, tier).adapter.offer('b-1')).resolves.toEqual({
      kind: 'member_price',
      tierName: 'Silver',
      price: 350,
      currency: 'THB',
    })
    await expect(setup({ currency: 'USD' }, tier).adapter.offer('b-1')).resolves.toEqual({ kind: 'none' })
  })

  it('offers nothing without a tier, without an insurance benefit, or for an unknown booking', async () => {
    await expect(setup({ currency: 'THB' }, { tierCode: null }).adapter.offer('b-1')).resolves.toEqual({ kind: 'none' })
    const none = { tierCode: 'bronze', name: 'Bronze', benefits: { ...BENEFITS, insurance: { kind: 'none' } } }
    await expect(setup({ currency: 'THB' }, none).adapter.offer('b-1')).resolves.toEqual({ kind: 'none' })
    await expect(setup(null, { tierCode: null }).adapter.offer('missing')).resolves.toEqual({ kind: 'none' })
  })

  it('asks feature 11 to issue and cancel the policy', async () => {
    const h = setup({ currency: 'THB' }, { tierCode: null })
    await expect(h.adapter.issue('b-1')).resolves.toEqual({ policyNumber: 'P1', price: 0, currency: 'THB', status: 'active' })
    await expect(h.adapter.cancel('b-1')).resolves.toBeNull()
    expect(h.policies.issueInsurancePolicy).toHaveBeenCalledWith('b-1')
    expect(h.policies.cancelInsurancePolicy).toHaveBeenCalledWith('b-1')
  })
})
