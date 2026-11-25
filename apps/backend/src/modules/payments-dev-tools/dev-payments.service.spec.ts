import { ForbiddenException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import { DevPaymentsService } from './dev-payments.service'
import type { CreateDevPaymentDto } from './dto/create-dev-payment.dto'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

// TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.

const NOW = new Date('2026-11-15T10:00:00.000Z')

function setup(customer: { id: string } | null = { id: 'cust-1' }) {
  const db = { customer: { findFirst: jest.fn().mockResolvedValue(customer) } }
  const createPayment = jest.fn().mockImplementation((input: { amount_total: number; expires_at: Date }) =>
    Promise.resolve({
      id: '00000000-0000-4000-8000-0000000012ab',
      purchase_ref: 'DEVABC123',
      status: 'created',
      provider: 'fake',
      amount_total: input.amount_total,
      currency: 'USD',
      started_at: NOW,
      expires_at: input.expires_at,
    }),
  )
  const svc = new DevPaymentsService(
    db as unknown as DbService,
    { createPayment } as unknown as PaymentsCheckoutService,
    { now: () => NOW } as unknown as SimulationClock,
  )
  return { svc, createPayment, db }
}

const dto = (over: Partial<CreateDevPaymentDto> = {}): CreateDevPaymentDto => ({ amount: 72, ...over })

describe('DevPaymentsService.create', () => {
  it('starts a payment the way a selling feature would: a card amount, one line, a hold, the payer', async () => {
    const { svc, createPayment } = setup()

    const created = await svc.create('user-1', dto({ description: 'Hot meal' }))

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        source_feature: 12,
        payer_customer_id: 'cust-1',
        amount_total: 72,
        lines: [{ line_type: 'onboard_order', description: 'Hot meal', amount: 72 }],
      }),
    )
    expect(created).toMatchObject({
      id: '00000000-0000-4000-8000-0000000012ab',
      status: 'created',
      amount: 72,
      currency: 'USD',
      description: 'Hot meal',
    })
    expect(created.reference).toMatch(/^PAY-20261115-12AB$/)
  })

  it('gives it a booking-style reference (a refund request takes that form only) and a tagged key, different each time', async () => {
    const { svc, createPayment } = setup()

    await svc.create('user-1', dto())
    await svc.create('user-1', dto())

    const [first, second] = createPayment.mock.calls.map((call) => call[0] as { purchase_ref: string; idempotency_key: string })
    expect(first.purchase_ref).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(first.idempotency_key).toMatch(/^dev-/)
    expect(first.idempotency_key).not.toBe(second.idempotency_key)
  })

  it('holds for 25 minutes unless asked otherwise, on the simulation clock', async () => {
    const { svc, createPayment } = setup()

    await svc.create('user-1', dto())
    await svc.create('user-1', dto({ hold_minutes: 5 }))

    const holds = createPayment.mock.calls.map((call) => ((call[0] as { expires_at: Date }).expires_at.getTime() - NOW.getTime()) / 60_000)
    expect(holds).toEqual([25, 5])
  })

  it('is for customers only', async () => {
    const { svc, createPayment } = setup(null)

    await expect(svc.create('a-staff-member', dto())).rejects.toBeInstanceOf(ForbiddenException)
    expect(createPayment).not.toHaveBeenCalled()
  })
})
