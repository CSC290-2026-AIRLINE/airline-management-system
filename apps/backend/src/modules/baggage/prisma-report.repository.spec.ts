import type { DbService } from '@backend/db/db.service'
import { PrismaReportRepository } from './prisma-report.repository'

const reportRow = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  case_number: 'LB-2026-000001',
  booking_passenger_id: '00000000-0000-4000-8000-000000000002',
  passenger_id: '00000000-0000-4000-8000-000000000003',
  flight_id: '00000000-0000-4000-8000-000000000004',
  reported_by_customer_id: null,
  reported_by_staff_id: null,
  tag_number: null,
  bag_type: 'suitcase',
  colour: 'black',
  brand: null,
  description: null,
  photo_url: null,
  contact_email: 'passenger@example.com',
  contact_phone: null,
  status: 'matched',
  reported_at: new Date('2026-10-29T10:00:00Z'),
  lost_at: null,
  closed_at: null,
  created_at: new Date('2026-10-29T10:00:00Z'),
  updated_at: new Date('2026-10-29T10:00:00Z'),
  bag_delivery: null,
  bag_match: [
    {
      found_bag_id: '00000000-0000-4000-8000-000000000005',
      reviewed_at: new Date('2026-10-29T11:00:00Z'),
    },
  ],
  ...overrides,
})

function makeRepository(
  options: {
    lockedRows?: { id: string }[]
    report?: ReturnType<typeof reportRow> | null
    locationEvents?: { id: string; found_bag_id: string; action: string; occurred_at: Date }[]
  } = {},
) {
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(reportRow({ ...options.report, ...data })))
  const findFirst = jest.fn().mockImplementation(({ where }: { where: { status: { in: string[] } } }) => {
    const report = options.report === undefined ? reportRow() : options.report
    return Promise.resolve(report && where.status.in.includes(report.status) ? report : null)
  })
  const findDispatchEvent = jest.fn().mockImplementation(({ where }: { where: { OR: Record<string, unknown>[] } }) => {
    const events = options.locationEvents ?? []
    const match = events.find((event) =>
      where.OR.some((condition) => {
        const eventTime = condition.occurred_at as { gte: Date }
        const actions = (condition.action as { in: string[] }).in
        return event.found_bag_id === condition.found_bag_id && actions.includes(event.action) && event.occurred_at >= eventTime.gte
      }),
    )
    return Promise.resolve(match ?? null)
  })
  const queryRaw = jest.fn().mockResolvedValue(options.lockedRows ?? [{ id: reportRow().id }])
  const tx = {
    $queryRaw: queryRaw,
    lost_bag_report: { findFirst, update },
    bag_location_event: { findFirst: findDispatchEvent },
  }
  const transaction = jest.fn((callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx))
  const repository = new PrismaReportRepository({ $transaction: transaction } as unknown as DbService)

  return { repository, transaction, queryRaw, findFirst, findDispatchEvent, update }
}

describe('PrismaReportRepository cancellation', () => {
  const reportId = reportRow().id
  const bookingPassengerId = reportRow().booking_passenger_id
  const closedAt = new Date('2026-10-29T12:00:00Z')

  it('cancels a matched report before dispatch and records closure time', async () => {
    const harness = makeRepository()

    const cancelled = await harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)

    expect(cancelled).toMatchObject({ status: 'cancelled', closedAt })
    expect(harness.queryRaw).toHaveBeenCalledTimes(1)
    expect(harness.findDispatchEvent).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            found_bag_id: '00000000-0000-4000-8000-000000000005',
            action: { in: ['sent', 'out_for_delivery', 'delivered'] },
            occurred_at: { gte: new Date('2026-10-29T11:00:00Z') },
          },
        ],
      },
    })
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: reportId },
      data: { status: 'cancelled', closed_at: closedAt, updated_at: closedAt },
    })
  })

  it('rejects a repeated cancellation after the report is already cancelled', async () => {
    const harness = makeRepository({ report: reportRow({ status: 'cancelled' }) })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toBeNull()

    expect(harness.update).not.toHaveBeenCalled()
    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
  })

  it('does not lock or cancel a report for a different booking passenger', async () => {
    const harness = makeRepository({ lockedRows: [] })

    await expect(harness.repository.cancelIfNotDispatched(reportId, '00000000-0000-4000-8000-000000000099', closedAt)).resolves.toBeNull()

    expect(harness.findFirst).not.toHaveBeenCalled()
    expect(harness.update).not.toHaveBeenCalled()
  })

  it.each(['sent', 'out_for_delivery', 'delivered'])('rejects cancellation after a confirmed match has a %s event', async (action) => {
    const harness = makeRepository({
      locationEvents: [
        {
          id: 'dispatch-event',
          found_bag_id: '00000000-0000-4000-8000-000000000005',
          action,
          occurred_at: new Date('2026-10-29T11:01:00Z'),
        },
      ],
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toBeNull()

    expect(harness.update).not.toHaveBeenCalled()
  })

  it.each(['arrived', 'at_diverted_airport'])('allows cancellation when %s movement is not recovery dispatch', async (action) => {
    const harness = makeRepository({
      locationEvents: [
        {
          id: 'movement-event',
          found_bag_id: '00000000-0000-4000-8000-000000000005',
          action,
          occurred_at: new Date('2026-10-29T11:01:00Z'),
        },
      ],
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toMatchObject({
      status: 'cancelled',
    })
    expect(harness.update).toHaveBeenCalledTimes(1)
  })

  it('allows cancellation despite sent and arrived movements recorded before the report', async () => {
    const harness = makeRepository({
      locationEvents: [
        {
          id: 'historical-sent',
          found_bag_id: '00000000-0000-4000-8000-000000000005',
          action: 'sent',
          occurred_at: new Date('2026-10-29T09:00:00Z'),
        },
        {
          id: 'historical-arrival',
          found_bag_id: '00000000-0000-4000-8000-000000000005',
          action: 'arrived',
          occurred_at: new Date('2026-10-29T09:30:00Z'),
        },
      ],
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toMatchObject({
      status: 'cancelled',
    })
    expect(harness.update).toHaveBeenCalledTimes(1)
  })

  it('rejects cancellation when delivery is already in transit', async () => {
    const harness = makeRepository({
      report: reportRow({ bag_delivery: { status: 'in_transit' } }),
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toBeNull()

    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
    expect(harness.update).not.toHaveBeenCalled()
  })
})
