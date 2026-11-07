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
      found_bag: { status: 'matched' },
    },
  ],
  ...overrides,
})

function makeRepository(
  options: {
    lockedRows?: { id: string }[]
    report?: ReturnType<typeof reportRow> | null
    eventHistory?: { action: string; occurred_at: Date } | null
  } = {},
) {
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(reportRow({ ...options.report, ...data })))
  const findFirst = jest.fn().mockImplementation(({ where }: { where: { status: { in: string[] } } }) => {
    const report = options.report === undefined ? reportRow() : options.report
    return Promise.resolve(report && where.status.in.includes(report.status) ? report : null)
  })
  const findDispatchEvent = jest.fn().mockResolvedValue(options.eventHistory ?? null)
  const findDeliveryUnique = jest.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000006' })
  const queryRaw = jest.fn().mockResolvedValue(options.lockedRows ?? [{ id: reportRow().id }])
  const tx = {
    $queryRaw: queryRaw,
    lost_bag_report: { findFirst, update },
    bag_location_event: { findFirst: findDispatchEvent },
  }
  const transaction = jest.fn((callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx))
  const repository = new PrismaReportRepository({
    $transaction: transaction,
    bag_delivery: { findUnique: findDeliveryUnique },
  } as unknown as DbService)

  return { repository, transaction, queryRaw, findFirst, findDispatchEvent, findDeliveryUnique, update }
}

describe('PrismaReportRepository delivery lookup', () => {
  it('looks up the delivery by the verified report id', async () => {
    const harness = makeRepository()
    const reportId = reportRow().id

    await expect(harness.repository.findDeliveryIdByReportId(reportId)).resolves.toBe('00000000-0000-4000-8000-000000000006')
    expect(harness.findDeliveryUnique).toHaveBeenCalledWith({ where: { report_id: reportId }, select: { id: true } })
  })

  it('returns null when the report has no delivery', async () => {
    const harness = makeRepository()
    harness.findDeliveryUnique.mockResolvedValue(null)

    await expect(harness.repository.findDeliveryIdByReportId(reportRow().id)).resolves.toBeNull()
  })
})

describe('PrismaReportRepository cancellation', () => {
  const reportId = reportRow().id
  const bookingPassengerId = reportRow().booking_passenger_id
  const closedAt = new Date('2026-10-29T12:00:00Z')

  it('cancels a matched report before dispatch and records closure time', async () => {
    const harness = makeRepository()

    const cancelled = await harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)

    expect(cancelled).toMatchObject({ status: 'cancelled', closedAt })
    expect(harness.queryRaw).toHaveBeenCalledTimes(1)
    expect(harness.findFirst).toHaveBeenCalledWith({
      where: {
        id: reportId,
        booking_passenger_id: bookingPassengerId,
        status: { in: ['open', 'matched', 'lost'] },
      },
      include: {
        bag_delivery: true,
        bag_match: {
          where: { status: 'confirmed' },
          select: { found_bag_id: true, found_bag: { select: { status: true } } },
        },
      },
    })
    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
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

  it.each(['sent', 'delivered'])('rejects cancellation when the matched found bag status is %s', async (status) => {
    const harness = makeRepository({
      report: reportRow({
        bag_match: [
          {
            found_bag_id: '00000000-0000-4000-8000-000000000005',
            reviewed_at: new Date('2026-10-29T11:00:00Z'),
            found_bag: { status },
          },
        ],
      }),
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toBeNull()

    expect(harness.update).not.toHaveBeenCalled()
    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
  })

  it.each(['waiting_choice', 'preparing'])('allows cancellation while delivery is %s', async (status) => {
    const harness = makeRepository({ report: reportRow({ bag_delivery: { status } }) })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toMatchObject({
      status: 'cancelled',
    })
    expect(harness.update).toHaveBeenCalledTimes(1)
    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
  })

  it('rejects when delivery is in transit even if dispatch occurred_at predates reviewed_at after a clock rewind', async () => {
    const report = reportRow({
      bag_delivery: { status: 'in_transit' },
      bag_match: [
        {
          found_bag_id: '00000000-0000-4000-8000-000000000005',
          reviewed_at: new Date('2026-10-29T11:00:00Z'),
          found_bag: { status: 'sent' },
        },
      ],
    })
    const harness = makeRepository({
      report,
      eventHistory: { action: 'sent', occurred_at: new Date('2026-10-29T10:59:00Z') },
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toBeNull()

    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
    expect(harness.update).not.toHaveBeenCalled()
  })

  it('allows historical sent movement when report and delivery remain pre-dispatch', async () => {
    const harness = makeRepository({
      report: reportRow({ bag_delivery: { status: 'preparing' } }),
      eventHistory: { action: 'sent', occurred_at: new Date('2026-10-29T09:00:00Z') },
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toMatchObject({
      status: 'cancelled',
    })

    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
    expect(harness.update).toHaveBeenCalledTimes(1)
  })

  it('rejects when the report is delivering even if delivery state has not caught up', async () => {
    const harness = makeRepository({
      report: reportRow({ status: 'delivering', bag_delivery: { status: 'preparing' } }),
    })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toBeNull()

    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
    expect(harness.update).not.toHaveBeenCalled()
  })

  it.each(['in_transit', 'ready_for_pickup', 'delivered'])('rejects cancellation when delivery status is %s', async (status) => {
    const harness = makeRepository({ report: reportRow({ bag_delivery: { status } }) })

    await expect(harness.repository.cancelIfNotDispatched(reportId, bookingPassengerId, closedAt)).resolves.toBeNull()

    expect(harness.findDispatchEvent).not.toHaveBeenCalled()
    expect(harness.update).not.toHaveBeenCalled()
  })
})
