// PaymentEventsService test: who may report a payment. The route is a
// service call from F5, but until F5 ships customer-web posts the result
// itself, so a caller who is a customer may only report payments for
// their own orders. Before, any signed-in user could mark any order paid.

import type { DbService } from '../../../db/db.service'
import type { AuditService } from '../common/audit.service'
import type { StubPaymentsService } from '../common/cross-module-ports'
import type { FlightContextService } from '../common/flight-context.service'
import type { ReservationsService } from '../common/reservations.service'
import { ApiErrorException } from '../common/api-error'
import { PaymentEventsService } from './payment-events.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-23T10:00:00Z')

// An order that is already paid, so a repeated "paid" event is a no-op
// and the test never reaches the writes.
const PAID_ORDER = {
  id: 'order-1',
  customer_id: 'cust-owner',
  flight_id: 'flight-1',
  status: 'confirmed',
  payment_id: 'pay-1',
  paid_at: new Date('2026-11-23T09:00:00Z'),
  expires_at: new Date('2026-11-23T09:30:00Z'),
  product_order_line: [],
}

function setup(callerCustomer: { id: string } | null) {
  const db = {
    product_order: { findUnique: jest.fn().mockResolvedValue(PAID_ORDER), findFirst: jest.fn(), updateMany: jest.fn() },
    customer: { findFirst: jest.fn().mockResolvedValue(callerCustomer) },
    $transaction: jest.fn(),
  }
  const service = new PaymentEventsService(
    db as unknown as DbService,
    { now: () => NOW },
    {} as AuditService,
    {} as StubPaymentsService,
    {} as FlightContextService,
    {} as ReservationsService,
  )
  return { service, db }
}

const EVENT = { reference: 'order-1', paymentId: 'pay-1', status: 'paid' }

describe('PaymentEventsService caller check', () => {
  it("refuses a customer reporting a payment for someone else's order, as NOT_FOUND", async () => {
    const { service, db } = setup({ id: 'cust-other' })

    const result = service.handle(EVENT, 'user-other')

    await expect(result).rejects.toBeInstanceOf(ApiErrorException)
    await expect(result).rejects.toMatchObject({ response: { error: { code: 'NOT_FOUND' } } })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('lets the owner report the payment for their own order', async () => {
    const { service } = setup({ id: 'cust-owner' })
    await expect(service.handle(EVENT, 'user-owner')).resolves.toMatchObject({ orderId: 'order-1' })
  })

  it('lets a caller with no customer record (the F5 service) report any order', async () => {
    const { service } = setup(null)
    await expect(service.handle(EVENT, 'user-f5')).resolves.toMatchObject({ orderId: 'order-1' })
  })
})
