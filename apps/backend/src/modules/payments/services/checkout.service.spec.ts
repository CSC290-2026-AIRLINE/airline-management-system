import { BadRequestException, ConflictException } from '@nestjs/common'
import type { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { PaymentProvider } from '../providers/payment-provider'
import type { BookingSeller, CargoSeller, Purchase } from '../sellers/seller'
import { CheckoutService } from './checkout.service'
import type { PaymentEngineService } from './payment-engine.service'
import type { PaymentSettingsService } from './support.services'
import type { VoucherService } from './voucher.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class AuditService {} }))

const NOW = new Date('2026-11-04T02:00:00Z')
const customer = { kind: 'customer' as const, userId: 'u1', customerId: 'c1' }

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    sourceFeature: 3,
    purchaseRef: 'booking:b1',
    customerId: 'c1',
    bookingId: 'b1',
    cargoBookingId: null,
    payable: true,
    expiresAt: new Date(NOW.getTime() + 10 * 60_000),
    currency: 'USD',
    lines: [{ lineType: 'fare', bookingId: 'b1', bookingCouponId: 'k1', description: 'TG100 BKK-NRT', amountCents: 14100 }],
    milesBooking: false,
    label: 'ABC123',
    cancelPath: '/checkout/ABC123',
    ...overrides,
  }
}

function setup() {
  const db = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(db)),
    payment: { findFirst: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    payment_line: { createMany: jest.fn() },
    payment_attempt: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0), create: jest.fn() },
  }
  const provider = { name: 'fake', createSession: jest.fn(), lookupSession: jest.fn() }
  const seller = { getBooking: jest.fn(), getCargoBooking: jest.fn() }
  const engine = { completeWithoutProvider: jest.fn() }
  const vouchers = { reserve: jest.fn(), validate: jest.fn() }
  const settings = { get: jest.fn().mockResolvedValue(3) }
  const service = new CheckoutService(
    db,
    { now: () => NOW } as unknown as SimulationClock,
    provider as unknown as PaymentProvider,
    seller as unknown as BookingSeller,
    seller as unknown as CargoSeller,
    engine as unknown as PaymentEngineService,
    vouchers as unknown as VoucherService,
    settings as unknown as PaymentSettingsService,
  )
  // checkoutResult reads the payment back; the presentation is tested elsewhere.
  jest.spyOn(service, 'view').mockImplementation((id: string) => Promise.resolve({ id, status: 'created', provider: 'fake' } as never))
  return { db, provider, seller, engine, vouchers, service }
}

describe('CheckoutService.create', () => {
  it('needs an Idempotency-Key', async () => {
    const { service } = setup()
    await expect(service.create(customer, { bookingReference: 'ABC123', idempotencyKey: ' ' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('returns the existing payment for the same key from the same customer instead of creating a second one', async () => {
    const { db, seller, service } = setup()
    seller.getBooking.mockResolvedValue(purchase())
    db.payment.findFirst.mockResolvedValue({ id: 'p-existing' })

    const result = await service.create(customer, { bookingReference: 'ABC123', idempotencyKey: 'key-1' })

    expect(result.payment).toMatchObject({ id: 'p-existing' })
    expect(db.payment.create).not.toHaveBeenCalled()
  })

  it('answers the winner when two simultaneous calls with the same key race on the unique index', async () => {
    const { db, seller, service } = setup()
    seller.getBooking.mockResolvedValue(purchase())
    db.payment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p-winner' })
    db.payment.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on the fields: (`payer_customer_id`,`idempotency_key`)'), { code: 'P2002' }),
    )

    const result = await service.create(customer, { bookingReference: 'ABC123', idempotencyKey: 'key-1' })

    expect(result.payment).toMatchObject({ id: 'p-winner' })
  })

  it('refuses a hold with less than min_hold_minutes left (HOLD_TOO_SHORT)', async () => {
    const { db, seller, service } = setup()
    seller.getBooking.mockResolvedValue(purchase({ expiresAt: new Date(NOW.getTime() + 2 * 60_000) }))
    db.payment.findFirst.mockResolvedValue(null)

    const error = await service.create(customer, { bookingReference: 'ABC123', idempotencyKey: 'k' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ error: { code: 'HOLD_TOO_SHORT' } })
  })

  it("answers 404 for another customer's booking", async () => {
    const { seller, service } = setup()
    seller.getBooking.mockResolvedValue(purchase({ customerId: 'someone-else' }))

    await expect(service.create(customer, { bookingReference: 'ABC123', idempotencyKey: 'k' })).rejects.toMatchObject({ status: 404 })
  })

  it('skips the provider for a voucher-only checkout and goes straight to confirm and capture', async () => {
    const { db, seller, vouchers, engine, provider, service } = setup()
    seller.getBooking.mockResolvedValue(purchase())
    db.payment.findFirst.mockResolvedValue(null)
    vouchers.reserve.mockResolvedValue({ voucherId: 'v1', voucherCents: 14100 })
    db.payment.create.mockResolvedValue({ id: 'p1' })
    db.payment.findUniqueOrThrow.mockResolvedValue({ id: 'p1', provider: 'none' })

    await service.create(customer, { bookingReference: 'ABC123', idempotencyKey: 'k', voucherCode: 'ABCDEFGH23' })

    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'none', voucher_amount: '141.00', card_amount: '0.00', voucher_id: 'v1' }),
    })
    expect(engine.completeWithoutProvider).toHaveBeenCalledWith('p1')
    expect(provider.createSession).not.toHaveBeenCalled()
  })
})
