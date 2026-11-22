import { NotFoundException } from '@nestjs/common'
import { BookingError } from '../common/booking-error'
import type { InsuranceOffer } from '../contracts'
import { BookingInsuranceService } from './insurance.service'

// The real DbService and feature 11's clock load ESM config modules Jest cannot require; the tests pass their own stubs.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/simulation-clock', () => ({ SimulationClock: class {} }))

function setup(offer: InsuranceOffer, booking: { bookingId: string; status: string } | null = { bookingId: 'b-1', status: 'held' }) {
  const db = { booking: { findUnique: jest.fn().mockResolvedValue(booking && { id: booking.bookingId }) } }
  const read = { getBookingForUser: jest.fn().mockResolvedValue(booking) }
  const insurance = {
    offer: jest.fn().mockResolvedValue(offer),
    issue: jest.fn().mockResolvedValue({ policyNumber: 'P1', price: 350, currency: 'THB', status: 'active' }),
    cancel: jest.fn(),
  }
  const checkout = { charge: jest.fn().mockResolvedValue({ paymentId: 'pay-1', amount: 350, currency: 'THB' }) }
  const service = new BookingInsuranceService(db as never, read as never, insurance, checkout)
  return { service, insurance, checkout }
}

const SILVER: InsuranceOffer = { kind: 'member_price', tierName: 'Silver', price: 350, currency: 'THB' }

describe('BookingInsuranceService', () => {
  it('answers the offer of a booking the caller can read, and 404 otherwise', async () => {
    await expect(setup(SILVER).service.offerForUser('ABC234', 'user-1')).resolves.toEqual(SILVER)
    await expect(setup(SILVER, null).service.offerForUser('ABC234', 'user-1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('offers nothing on a cancelled or expired booking', async () => {
    const h = setup(SILVER, { bookingId: 'b-1', status: 'cancelled' })
    await expect(h.service.offerForUser('ABC234', 'user-1')).resolves.toEqual({ kind: 'none' })
    expect(h.insurance.offer).not.toHaveBeenCalled()
  })

  it('charges the add-on as feature 11’s insurance line, then issues the policy', async () => {
    const h = setup(SILVER)
    await expect(h.service.settleAfterConfirm('b-1', true)).resolves.toMatchObject({ policyNumber: 'P1' })
    expect(h.checkout.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b-1',
        amount: 350,
        currency: 'THB',
        idempotencyKey: 'insurance:b-1',
        line: expect.objectContaining({ lineType: 'insurance', sourceRef: 'insurance:b-1' }),
      }),
    )
    expect(h.insurance.issue).toHaveBeenCalledWith('b-1')
  })

  it('charges nothing when the add-on is not chosen, and still issues an included policy', async () => {
    const h = setup({ kind: 'included', tierName: 'Gold' })
    await h.service.settleAfterConfirm('b-1', false)
    expect(h.checkout.charge).not.toHaveBeenCalled()
    expect(h.insurance.issue).toHaveBeenCalledWith('b-1')
  })

  it('refuses an add-on the tier does not sell before anything is confirmed', async () => {
    await expect(setup({ kind: 'included', tierName: 'Gold' }).service.assertAddable('ABC234')).rejects.toBeInstanceOf(BookingError)
    await expect(setup(SILVER).service.assertAddable('ABC234')).resolves.toBeUndefined()
  })

  it('never fails the confirm when feature 11 cannot issue the policy', async () => {
    const h = setup(SILVER)
    h.insurance.issue.mockRejectedValue(new Error('loyalty down'))
    await expect(h.service.settleAfterConfirm('b-1', false)).resolves.toBeNull()
  })
})
