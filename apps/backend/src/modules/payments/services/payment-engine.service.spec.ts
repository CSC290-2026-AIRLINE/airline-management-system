import type { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { PaymentProvider } from '../providers/payment-provider'
import type { BookingSeller, CargoSeller } from '../sellers/seller'
import { PaymentEngineService } from './payment-engine.service'
import type { VoucherService } from './voucher.service'
import type { FinancePostingService, PaymentMessagesService, PaymentSettingsService } from './support.services'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests pass `db` below instead.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const NOW = new Date('2026-11-04T02:00:00Z')
const PAYMENT_ID = '11111111-1111-1111-1111-111111111111'

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    status: 'authorised',
    source_feature: 3,
    purchase_ref: 'booking:b1',
    provider: 'fake',
    currency: 'USD',
    amount_total: '141.00',
    voucher_amount: '0.00',
    card_amount: '141.00',
    voucher_id: null,
    payer_customer_id: 'c1',
    capture_attempts: 0,
    capture_stalled_at: null,
    ...overrides,
  }
}

function setup() {
  const db = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(db)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    payment: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    payment_attempt: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    payment_line: { findMany: jest.fn().mockResolvedValue([{ line_type: 'fare', amount: '141.00' }]) },
    customer: { findUnique: jest.fn().mockResolvedValue({ passenger: { first_name: 'Ada', last_name: 'Lee' } }) },
  }
  const provider = { name: 'fake', capture: jest.fn(), cancel: jest.fn(), expireSession: jest.fn() }
  const seller = { sourceFeature: 3, confirm: jest.fn(), release: jest.fn(), onCaptured: jest.fn(), getBooking: jest.fn() }
  const settings = { get: jest.fn().mockResolvedValue(3) }
  const vouchers = { redeem: jest.fn() }
  const receipts = { issue: jest.fn().mockResolvedValue({ document_number: 'RC-2026-000001' }) }
  const postings = { post: jest.fn() }
  const messages = { send: jest.fn() }
  const clock = { now: () => NOW }
  const engine = new PaymentEngineService(
    db,
    clock as unknown as SimulationClock,
    provider as unknown as PaymentProvider,
    seller as unknown as BookingSeller,
    seller as unknown as CargoSeller,
    settings as unknown as PaymentSettingsService,
    vouchers as unknown as VoucherService,
    receipts,
    postings as unknown as FinancePostingService,
    messages as unknown as PaymentMessagesService,
  )
  return { db, provider, seller, settings, vouchers, receipts, postings, messages, engine }
}

describe('PaymentEngineService', () => {
  it('voids the authorisation when the seller refuses the confirm (409), so nothing is charged or refunded', async () => {
    const { db, provider, seller, engine } = setup()
    db.payment.findUnique.mockResolvedValue(payment())
    db.payment_attempt.findFirst.mockResolvedValue({ provider_intent_id: 'pi_1' })
    seller.confirm.mockResolvedValue({ ok: false, code: 'SEAT_UNAVAILABLE', message: 'Seat gone' })

    await engine.confirmAndCapture(PAYMENT_ID)

    expect(provider.cancel).toHaveBeenCalledWith('pi_1')
    expect(provider.capture).not.toHaveBeenCalled()
    expect(db.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAYMENT_ID, status: 'authorised' }, data: expect.objectContaining({ status: 'voided' }) }),
    )
  })

  it('captures on a yes and issues the receipt, posting and message in one transaction', async () => {
    const { db, provider, seller, receipts, postings, messages, engine } = setup()
    db.payment.findUnique.mockResolvedValue(payment())
    db.payment_attempt.findFirst.mockResolvedValue({ provider_intent_id: 'pi_1' })
    seller.confirm.mockResolvedValue({ ok: true })
    provider.capture.mockResolvedValue({ ok: true, feeCents: 439 })

    await engine.confirmAndCapture(PAYMENT_ID)

    expect(provider.capture).toHaveBeenCalledWith('pi_1', 14100, 'USD')
    expect(receipts.issue).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ documentType: 'receipt', amountCents: 14100, billingName: 'Ada Lee' }),
    )
    expect(postings.post).toHaveBeenCalledWith(db, expect.objectContaining({ postingType: 'payment_captured' }))
    expect(postings.post).toHaveBeenCalledWith(db, expect.objectContaining({ postingType: 'payment_provider_fee' }))
    expect(messages.send).toHaveBeenCalledWith(db, 'payment_received', PAYMENT_ID, expect.any(Object))
    expect(seller.onCaptured).toHaveBeenCalledWith('booking:b1', PAYMENT_ID)
  })

  it('counts a failed capture and stalls the payment once capture_retry_limit is reached', async () => {
    const { db, provider, settings, engine } = setup()
    settings.get.mockResolvedValue(5)
    db.payment.findUnique.mockResolvedValue(payment({ capture_attempts: 4 }))
    db.payment_attempt.findFirst.mockResolvedValue({ provider_intent_id: 'pi_1' })
    provider.capture.mockResolvedValue({ ok: false, error: 'Stripe unavailable' })

    const result = await engine.capture(PAYMENT_ID)

    expect(result.ok).toBe(false)
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ capture_attempts: 5, capture_stalled_at: NOW }) }),
    )
  })

  it('does nothing for a replayed payment_intent.succeeded on a captured payment', async () => {
    const { db, receipts, postings, engine } = setup()
    db.payment.findUnique.mockResolvedValue(payment({ status: 'captured' }))

    const moved = await engine.markCaptured(db as never, PAYMENT_ID, null)

    expect(moved).toBe(false)
    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(receipts.issue).not.toHaveBeenCalled()
    expect(postings.post).not.toHaveBeenCalled()
  })

  it('records a zero-cash award booking as captured with a 0.00 receipt and no posting or message', async () => {
    const { db, seller, receipts, postings, messages, engine } = setup()
    const zero = payment({ status: 'created', provider: 'none', amount_total: '0.00', card_amount: '0.00' })
    db.payment.findUnique.mockResolvedValue(zero)
    seller.confirm.mockResolvedValue({ ok: true })

    await engine.completeWithoutProvider(PAYMENT_ID)

    expect(db.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'captured', captured_at: NOW, authorised_at: NOW }) }),
    )
    expect(receipts.issue).toHaveBeenCalledWith(db, expect.objectContaining({ amountCents: 0 }))
    expect(postings.post).not.toHaveBeenCalled()
    expect(messages.send).not.toHaveBeenCalled()
  })

  it('leaves the payment alone when the hosted session already completed at hold end (late path)', async () => {
    const { db, provider, engine } = setup()
    db.payment_attempt.findMany.mockResolvedValue([{ provider_session_id: 'cs_1' }])
    provider.expireSession.mockResolvedValue('complete')

    const ended = await engine.endUnpaid(PAYMENT_ID, 'expired', 'hold ended')

    expect(ended).toBe(false)
    expect(db.payment.updateMany).not.toHaveBeenCalled()
  })

  it('cancels a late authorisation for a payment that already expired', async () => {
    const { db, provider, seller, engine } = setup()
    db.payment.findUnique.mockResolvedValue(payment({ status: 'expired' }))
    db.payment_attempt.findUnique.mockResolvedValue(null)
    db.payment_attempt.findFirst.mockResolvedValue(null)

    await engine.onAuthorised(PAYMENT_ID, { intentId: 'pi_late' })

    expect(provider.cancel).toHaveBeenCalledWith('pi_late')
    expect(seller.confirm).not.toHaveBeenCalled()
  })
})
