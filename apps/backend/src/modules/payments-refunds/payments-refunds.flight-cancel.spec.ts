import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsRefundsService } from './payments-refunds.service'
import { InMemoryRefundRepository } from './refund.repository'
import type { CardRefundPort } from './card-refund.port'
import type { BookingInfo, FlightCancellation, PaidOnFlight } from './refund.types'

// The service imports the audit writer, which imports DbService; the tests need neither a database nor Clerk.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const FLIGHT = 'flight-1'

function booking(paymentId: string, reference: string): BookingInfo {
  return {
    reference,
    customer_id: 'customer-1',
    payment_id: paymentId,
    currency: 'USD',
    total: 300,
    card_brand: 'Visa',
    card_last4: '4242',
  }
}

function paid(paymentId: string, reference: string, lines: [string, number][]): PaidOnFlight {
  return {
    booking: booking(paymentId, reference),
    lines: lines.map(([id, remaining]) => ({ payment_line_id: id, description: `Fare ${id}`, remaining })),
  }
}

function event(id: string, seq: number, flightId = FLIGHT): FlightCancellation {
  return { event_id: id, flight_id: flightId, seq }
}

function setup(port?: Partial<CardRefundPort>) {
  const repo = new InMemoryRefundRepository()
  const audit = { resolveActor: jest.fn(), tryWrite: jest.fn().mockResolvedValue(true) }
  const cardPort: CardRefundPort | undefined = port
    ? {
        refundToCard: jest.fn().mockResolvedValue({ status: 'pending', provider_refund_id: 're_1', failure_code: null }),
        recordRefundSucceeded: jest.fn().mockResolvedValue({ credit_note_number: 'CN-1' }),
        recordRefundFailed: jest.fn().mockResolvedValue(undefined),
        ...port,
      }
    : undefined
  const svc = new PaymentsRefundsService(repo, new SimulationClock(), audit as unknown as AuditService, cardPort)
  return { repo, svc, cardPort }
}

describe('PaymentsRefundsService — the airline cancels a flight (flight.cancelled, resolution refund)', () => {
  it('makes one refund per payment, split across its lines, for 100% of what is left, with no fee', async () => {
    const { repo, svc } = setup()
    repo.paidOnFlight.set(FLIGHT, [
      paid('pay-a', 'AAA111', [
        ['l1', 120.5],
        ['l2', 30.25],
      ]),
      paid('pay-b', 'BBB222', [['l3', 99]]),
    ])

    const result = await svc.handleFlightCancelled(event('ev-1', 1))

    expect(result.refunds).toBe(2)
    const refunds = await repo.listRefunds()
    const a = refunds.find((refund) => refund.payment_id === 'pay-a')!
    expect(a).toMatchObject({
      reason: 'flight_cancelled',
      method: 'original',
      amount: 150.75,
      fee_withheld: 0,
      source_key: 'flight_cancelled:ev-1:pay-a',
    })
    expect(a.lines).toEqual([
      { payment_line_id: 'l1', amount: 120.5 },
      { payment_line_id: 'l2', amount: 30.25 },
    ])
    expect(refunds.find((refund) => refund.payment_id === 'pay-b')?.amount).toBe(99)
  })

  it('does nothing the second time the same event arrives', async () => {
    const { repo, svc } = setup()
    repo.paidOnFlight.set(FLIGHT, [paid('pay-a', 'AAA111', [['l1', 100]])])

    expect((await svc.handleFlightCancelled(event('ev-1', 1))).refunds).toBe(1)
    expect((await svc.handleFlightCancelled(event('ev-1', 1))).refunds).toBe(0)
    expect(await repo.listRefunds()).toHaveLength(1)
  })

  it('asks the card once per refund, and a replay does not ask again', async () => {
    const { repo, svc, cardPort } = setup({})
    repo.paidOnFlight.set(FLIGHT, [paid('pay-a', 'AAA111', [['l1', 100]]), paid('pay-b', 'BBB222', [['l2', 40]])])

    await svc.handleFlightCancelled(event('ev-1', 1))
    await svc.handleFlightCancelled(event('ev-1', 1))

    expect(cardPort!.refundToCard).toHaveBeenCalledTimes(2)
    expect(cardPort!.refundToCard).toHaveBeenCalledWith(expect.objectContaining({ payment_id: 'pay-a', amount: 100 }))
  })

  it('keeps the other payments going when one card refund throws, and leaves that refund processing', async () => {
    const refundToCard = jest
      .fn()
      .mockRejectedValueOnce(new Error('stripe down'))
      .mockResolvedValue({ status: 'pending', provider_refund_id: 're_2', failure_code: null })
    const { repo, svc } = setup({ refundToCard })
    repo.paidOnFlight.set(FLIGHT, [paid('pay-a', 'AAA111', [['l1', 100]]), paid('pay-b', 'BBB222', [['l2', 40]])])

    const result = await svc.handleFlightCancelled(event('ev-1', 1))

    expect(result.refunds).toBe(2)
    expect(refundToCard).toHaveBeenCalledTimes(2)
    const statuses = (await repo.listRefunds()).map((refund) => refund.status)
    expect(statuses).toEqual(['processing', 'processing'])
  })

  it('only refunds a payment that still has money on the flight, so a paid-out one is skipped by the repository', async () => {
    const { repo, svc } = setup()
    repo.paidOnFlight.set(FLIGHT, [])

    expect((await svc.handleFlightCancelled(event('ev-1', 1))).refunds).toBe(0)
    expect(await repo.listRefunds()).toHaveLength(0)
    /* The event still counts as handled: it had nothing to refund. */
    expect(repo.handledEvents.has('ev-1')).toBe(true)
  })

  it('catches up on every unhandled cancellation in seq order, and then finds nothing left', async () => {
    const { repo, svc } = setup()
    repo.cancellations.push(event('ev-late', 9, 'flight-2'), event('ev-early', 2, 'flight-1'))
    repo.paidOnFlight.set('flight-1', [paid('pay-a', 'AAA111', [['l1', 10]])])
    repo.paidOnFlight.set('flight-2', [paid('pay-b', 'BBB222', [['l2', 20]])])
    const order: string[] = []
    const handle = svc.handleFlightCancelled.bind(svc)
    jest.spyOn(svc, 'handleFlightCancelled').mockImplementation((e) => {
      order.push(e.event_id)
      return handle(e)
    })

    expect(await svc.catchUpFlightCancellations()).toBe(2)
    expect(order).toEqual(['ev-early', 'ev-late'])
    expect(await svc.catchUpFlightCancellations()).toBe(0)
  })

  it('leaves an event without a receipt when it fails, so the next pass tries it again', async () => {
    const { repo, svc } = setup()
    repo.cancellations.push(event('ev-1', 1))
    jest.spyOn(repo, 'listPaidLinesOnFlight').mockRejectedValueOnce(new Error('db down'))

    expect(await svc.catchUpFlightCancellations()).toBe(0)
    expect(repo.handledEvents.has('ev-1')).toBe(false)

    repo.paidOnFlight.set(FLIGHT, [paid('pay-a', 'AAA111', [['l1', 10]])])
    expect(await svc.catchUpFlightCancellations()).toBe(1)
  })
})
