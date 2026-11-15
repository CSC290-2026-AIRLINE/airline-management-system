import type { DbService } from '@backend/db/db.service'
import type { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { PaymentProvider } from '../providers/payment-provider'
import type { PaymentEngineService } from './payment-engine.service'
import type { RefundService } from './refund.service'
import { WebhookService } from './webhook.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/pricing/fare-quote/fare-quote.service', () => ({ FareQuoteService: class FareQuoteService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class AuditService {} }))

const NOW = new Date('2026-11-04T02:00:00Z')
const EVENT = { id: 'evt_1', type: 'payment_intent.amount_capturable_updated', paymentId: 'p1', intentId: 'pi_1' }

function setup() {
  const db = {
    payment: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
    payment_event_receipt: {
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  }
  const provider = { name: 'stripe', retrieveEvent: jest.fn() }
  const engine = { onAuthorised: jest.fn() }
  const service = new WebhookService(
    db as unknown as DbService,
    { now: () => NOW } as unknown as SimulationClock,
    provider as unknown as PaymentProvider,
    engine as unknown as PaymentEngineService,
    { applyProviderEvent: jest.fn() } as unknown as RefundService,
  )
  return { db, provider, engine, service }
}

describe('WebhookService', () => {
  it('writes the receipt first, applies the event, then marks it processed', async () => {
    const { db, engine, service } = setup()
    db.payment_event_receipt.findUniqueOrThrow.mockResolvedValue({ provider_event_id: 'evt_1', processed_at: null })

    expect(await service.ingest(EVENT)).toBe('applied')
    expect(db.payment_event_receipt.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ provider_event_id: 'evt_1', event_type: EVENT.type, payment_id: 'p1' }], skipDuplicates: true }),
    )
    expect(engine.onAuthorised).toHaveBeenCalledWith('p1', expect.objectContaining({ intentId: 'pi_1' }))
    expect(db.payment_event_receipt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { processed_at: NOW } }))
  })

  it('skips a repeat whose receipt has processed_at set', async () => {
    const { db, engine, service } = setup()
    db.payment_event_receipt.findUniqueOrThrow.mockResolvedValue({ provider_event_id: 'evt_1', processed_at: NOW })

    expect(await service.ingest(EVENT)).toBe('repeat')
    expect(engine.onAuthorised).not.toHaveBeenCalled()
  })

  it('applies again a repeat whose receipt has processed_at empty', async () => {
    const { db, engine, service } = setup()
    db.payment_event_receipt.findUniqueOrThrow.mockResolvedValue({ provider_event_id: 'evt_1', processed_at: null })

    await service.ingest(EVENT)
    await service.ingest(EVENT)

    expect(engine.onAuthorised).toHaveBeenCalledTimes(2)
  })

  it('stores and ignores an event it does not handle', async () => {
    const { db, engine, service } = setup()
    db.payment_event_receipt.findUniqueOrThrow.mockResolvedValue({ provider_event_id: 'evt_2', processed_at: null })

    expect(await service.ingest({ id: 'evt_2', type: 'customer.created', paymentId: null })).toBe('ignored')
    expect(engine.onAuthorised).not.toHaveBeenCalled()
  })

  it('re-reads unprocessed receipts from the provider in the reconcile job', async () => {
    const { db, provider, engine, service } = setup()
    db.payment_event_receipt.findMany.mockResolvedValue([{ provider_event_id: 'evt_1', payment_id: 'p1' }])
    provider.retrieveEvent.mockResolvedValue(EVENT)

    expect(await service.applyUnprocessed()).toBe(1)
    expect(engine.onAuthorised).toHaveBeenCalledWith('p1', expect.anything())
  })
})
