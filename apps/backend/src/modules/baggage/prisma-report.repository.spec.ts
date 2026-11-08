jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

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
  const findDeliveryChoiceUnique = jest.fn().mockResolvedValue({
    delivery_type: 'hotel',
    address: 'Hotel Gracery',
    pickup_airport: null,
    status: 'preparing',
  })
  const queryRaw = jest.fn().mockResolvedValue(options.lockedRows ?? [{ id: reportRow().id }])
  const tx = {
    $queryRaw: queryRaw,
    lost_bag_report: { findFirst, update },
    bag_location_event: { findFirst: findDispatchEvent },
  }
  const transaction = jest.fn((callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx))
  const repository = new PrismaReportRepository({
    $transaction: transaction,
    bag_delivery: {
      findUnique: findDeliveryUnique.mockImplementation(({ select }: { select?: Record<string, boolean> }) => {
        if (select?.delivery_type) return findDeliveryChoiceUnique()
        return Promise.resolve({ id: '00000000-0000-4000-8000-000000000006' })
      }),
    },
  } as unknown as DbService)

  return { repository, transaction, queryRaw, findFirst, findDispatchEvent, findDeliveryUnique, findDeliveryChoiceUnique, update }
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

  it('reads only the passenger-safe choice fields and delivery status by verified report id', async () => {
    const harness = makeRepository()
    const reportId = reportRow().id

    await expect(harness.repository.findDeliveryChoiceByReportId(reportId)).resolves.toEqual({
      deliveryType: 'hotel',
      address: 'Hotel Gracery',
      pickupAirport: null,
      status: 'preparing',
    })
    expect(harness.findDeliveryUnique).toHaveBeenCalledWith({
      where: { report_id: reportId },
      select: { delivery_type: true, address: true, pickup_airport: true, status: true },
    })
  })

  it('returns null when a verified report has no delivery choice record', async () => {
    const harness = makeRepository()
    harness.findDeliveryUnique.mockImplementation(() => Promise.resolve(null))

    await expect(harness.repository.findDeliveryChoiceByReportId(reportRow().id)).resolves.toBeNull()
  })
})

describe('PrismaReportRepository passenger case summary projection', () => {
  const reportId = reportRow().id
  const matchUpdatedAt = new Date('2026-10-20T11:00:00.000Z')
  const matchRecordedAt = new Date('2026-10-20T11:01:00.000Z')
  const reportCreatedAt = new Date('2026-10-20T10:00:00.000Z')
  const choiceRecordedAt = new Date('2026-10-20T12:00:00.000Z')
  const dispatchRecordedAt = new Date('2026-10-20T13:00:00.000Z')
  const deliveredRecordedAt = new Date('2026-10-20T14:00:00.000Z')
  const deliveryId = '00000000-0000-4000-8000-000000000006'
  const foundBagId = '00000000-0000-4000-8000-000000000005'

  function summaryHarness(
    options: {
      confirmed?: boolean
      withDelivery?: boolean
      choices?: unknown[]
      locations?: unknown[]
      deliveryStatus?: string
      deliveredAt?: Date | null
      lostAt?: Date | null
      closedAt?: Date | null
    } = {},
  ) {
    const report = {
      case_number: 'LB-2026-000001',
      status: options.closedAt ? 'closed' : 'matched',
      bag_type: 'suitcase',
      colour: 'blue',
      brand: 'Rimowa',
      tag_number: 'TAG123',
      description: 'Blue suitcase',
      reported_at: new Date('2026-10-20T09:00:00.000Z'),
      lost_at: options.lostAt ?? null,
      closed_at: options.closedAt ?? null,
      created_at: reportCreatedAt,
      passenger: { first_name: 'Tom', last_name: 'Becker' },
      flight: { flight_number: 'FY 204', service_date: new Date('2026-10-19T00:00:00.000Z'), route: { origin: 'BKK', destination: 'NRT' } },
      bag_match:
        options.confirmed === false
          ? []
          : [{ id: 'match-1', found_bag_id: foundBagId, reviewed_at: new Date('2026-10-20T08:00:00Z'), updated_at: matchUpdatedAt }],
      bag_delivery:
        options.withDelivery === false
          ? null
          : {
              id: deliveryId,
              delivery_type: 'hotel',
              address: 'Hotel Gracery',
              pickup_airport: null,
              status: options.deliveryStatus ?? 'delivered',
              delivered_at: options.deliveredAt === undefined ? new Date('2026-10-20T07:00:00Z') : options.deliveredAt,
              updated_at: deliveredRecordedAt,
            },
    }
    const findUnique = jest.fn().mockResolvedValue(report)
    const choices = [
      {
        occurred_at: new Date('2026-10-20T06:00:00Z'),
        recorded_at: choiceRecordedAt,
        seq: 42n,
        after: { deliveryType: 'hotel', chosenBy: 'passenger', customerId: 'private-id', reportId, address: 'private' },
      },
      {
        occurred_at: new Date('2026-10-20T06:30:00Z'),
        recorded_at: new Date('2026-10-20T12:30:00.000Z'),
        seq: 43n,
        after: { deliveryType: 'home', chosenBy: 'staff', staffId: 'private-staff-id' },
      },
      {
        occurred_at: new Date('2026-10-20T06:45:00Z'),
        recorded_at: new Date('2026-10-20T12:45:00.000Z'),
        seq: 44n,
        after: { deliveryType: 'hotel', chosenBy: 'staff' },
      },
    ]
    const auditFindMany = jest.fn().mockResolvedValue(options.choices ?? choices)
    const auditFindFirst = jest.fn().mockResolvedValue({
      recorded_at: matchRecordedAt,
      seq: 41n,
      after: { status: 'confirmed', foundBagId },
    })
    const locations = [
      {
        action: 'sent',
        airport_code: 'BKK',
        to_airport: 'NRT',
        note: 'private staff note',
        staff_id: 'private-staff-id',
        occurred_at: new Date('2026-10-20T05:00:00Z'),
        created_at: dispatchRecordedAt,
      },
      {
        action: 'out_for_delivery',
        airport_code: 'NRT',
        to_airport: null,
        occurred_at: new Date('2026-10-20T04:00:00Z'),
        created_at: new Date('2026-10-20T13:30:00.000Z'),
      },
      {
        action: 'delivered',
        airport_code: 'NRT',
        to_airport: null,
        occurred_at: new Date('2026-10-20T03:00:00Z'),
        created_at: deliveredRecordedAt,
      },
    ]
    const locationFindMany = jest.fn().mockResolvedValue(options.locations ?? locations)
    const repository = new PrismaReportRepository({
      lost_bag_report: { findUnique },
      audit_log: { findMany: auditFindMany, findFirst: auditFindFirst },
      bag_location_event: { findMany: locationFindMany },
    } as unknown as DbService)

    return { repository, findUnique, auditFindMany, auditFindFirst, locationFindMany }
  }

  it('projects only passenger-safe data and orders real events by insertion metadata across a clock rewind', async () => {
    const lostAt = new Date('2026-10-20T10:30:00.000Z')
    const closedAt = new Date('2026-10-20T15:00:00.000Z')
    const harness = summaryHarness({ lostAt, closedAt })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result).toEqual({
      caseNumber: 'LB-2026-000001',
      status: 'closed',
      reportedAt: new Date('2026-10-20T09:00:00.000Z'),
      lostAt,
      closedAt,
      passenger: { firstName: 'Tom', lastName: 'Becker' },
      flight: { flightNumber: 'FY 204', serviceDate: new Date('2026-10-19T00:00:00.000Z'), origin: 'BKK', destination: 'NRT' },
      bag: { type: 'suitcase', colour: 'blue', brand: 'Rimowa', tagNumber: 'TAG123', description: 'Blue suitcase' },
      delivery: { deliveryType: 'hotel', address: 'Hotel Gracery', pickupAirport: null, status: 'delivered' },
      timeline: [
        { type: 'report_received', occurredAt: new Date('2026-10-20T09:00:00.000Z') },
        { type: 'case_marked_lost', occurredAt: lostAt },
        { type: 'match_confirmed', occurredAt: new Date('2026-10-20T08:00:00Z') },
        { type: 'choice_saved', occurredAt: new Date('2026-10-20T06:00:00Z'), deliveryType: 'hotel', chosenBy: 'passenger' },
        { type: 'choice_saved', occurredAt: new Date('2026-10-20T06:30:00Z'), deliveryType: 'home', chosenBy: 'staff' },
        { type: 'choice_saved', occurredAt: new Date('2026-10-20T06:45:00Z'), deliveryType: 'hotel', chosenBy: 'staff' },
        { type: 'bag_sent', occurredAt: new Date('2026-10-20T05:00:00Z'), fromAirport: 'BKK', toAirport: 'NRT' },
        { type: 'out_for_delivery', occurredAt: new Date('2026-10-20T04:00:00Z'), airport: 'NRT' },
        { type: 'bag_delivered', occurredAt: new Date('2026-10-20T07:00:00Z') },
        { type: 'case_closed', occurredAt: closedAt },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('private-id')
    expect(JSON.stringify(result)).not.toContain('private-staff-id')
    expect(JSON.stringify(result)).not.toContain('private')
    expect(harness.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: reportId } }))
    const projection = harness.findUnique.mock.calls[0][0].select
    expect(projection).not.toHaveProperty('id')
    expect(projection).not.toHaveProperty('contact_email')
    expect(projection).not.toHaveProperty('contact_phone')
    expect(projection.passenger).toEqual({ select: { first_name: true, last_name: true } })
    expect(harness.locationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ found_bag_id: foundBagId, created_at: { gt: matchRecordedAt } }),
      }),
    )
    expect(harness.auditFindFirst).toHaveBeenCalledWith({
      where: { source_feature: '10', entity_type: 'bag_match', entity_id: 'match-1', action: 'status_change', is_sensitive: false },
      orderBy: { seq: 'desc' },
      select: { recorded_at: true, seq: true, after: true },
    })
    expect(harness.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entity_id: deliveryId, is_sensitive: false }) }),
    )
  })

  it('omits the closure milestone when closed_at is null', async () => {
    const harness = summaryHarness({ lostAt: new Date('2026-10-20T10:30:00.000Z'), closedAt: null })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result?.closedAt).toBeNull()
    expect(result?.timeline.map((event) => event.type)).not.toContain('case_closed')
    expect(result?.timeline.map((event) => event.type)).toEqual(
      expect.arrayContaining(['report_received', 'case_marked_lost', 'match_confirmed']),
    )
  })

  it('omits all recovery milestones when no confirmed match or delivery exists', async () => {
    const harness = summaryHarness({ confirmed: false, withDelivery: false })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result?.delivery).toBeNull()
    expect(result?.timeline).toEqual([{ type: 'report_received', occurredAt: new Date('2026-10-20T09:00:00.000Z') }])
    expect(harness.auditFindMany).not.toHaveBeenCalled()
    expect(harness.auditFindFirst).not.toHaveBeenCalled()
    expect(harness.locationFindMany).not.toHaveBeenCalled()
  })

  it('omits choice and movement milestones when a confirmed case has no choice or movement audit', async () => {
    const harness = summaryHarness({
      choices: [],
      locations: [],
      deliveryStatus: 'waiting_choice',
      deliveredAt: null,
    })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result?.timeline.map((event) => event.type)).toEqual(['report_received', 'match_confirmed'])
  })

  it('omits dispatch and handover milestones when only the choice has been recorded', async () => {
    const harness = summaryHarness({
      locations: [],
      deliveryStatus: 'preparing',
      deliveredAt: null,
    })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result?.timeline.map((event) => event.type)).toEqual([
      'report_received',
      'match_confirmed',
      'choice_saved',
      'choice_saved',
      'choice_saved',
    ])
  })

  it('omits handover when dispatch exists but delivery is not delivered', async () => {
    const harness = summaryHarness({ deliveryStatus: 'in_transit', deliveredAt: null })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result?.timeline.map((event) => event.type)).toEqual([
      'report_received',
      'match_confirmed',
      'choice_saved',
      'choice_saved',
      'choice_saved',
      'bag_sent',
      'out_for_delivery',
    ])
  })

  it('does not present an arrival as recovery history unless a post-confirmation recovery send precedes it', async () => {
    const harness = summaryHarness({
      locations: [
        {
          action: 'arrived',
          airport_code: 'NRT',
          to_airport: null,
          occurred_at: new Date('2026-10-20T04:00:00Z'),
          created_at: dispatchRecordedAt,
        },
      ],
      deliveryStatus: 'in_transit',
      deliveredAt: null,
    })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result?.timeline.some((event) => event.type === 'bag_arrived')).toBe(false)
  })

  it('includes arrival only when it follows a persisted post-confirmation recovery send', async () => {
    const harness = summaryHarness({
      locations: [
        {
          action: 'sent',
          airport_code: 'BKK',
          to_airport: 'NRT',
          occurred_at: new Date('2026-10-20T05:00:00Z'),
          created_at: dispatchRecordedAt,
        },
        {
          action: 'arrived',
          airport_code: 'NRT',
          to_airport: null,
          occurred_at: new Date('2026-10-20T04:00:00Z'),
          created_at: new Date('2026-10-20T13:15:00.000Z'),
        },
      ],
      deliveryStatus: 'in_transit',
      deliveredAt: null,
    })
    const result = await harness.repository.findPassengerCaseSummaryByReportId(reportId)

    expect(result?.timeline.filter((event) => event.type === 'bag_sent' || event.type === 'bag_arrived')).toEqual([
      { type: 'bag_sent', occurredAt: new Date('2026-10-20T05:00:00Z'), fromAirport: 'BKK', toAirport: 'NRT' },
      { type: 'bag_arrived', occurredAt: new Date('2026-10-20T04:00:00Z'), airport: 'NRT' },
    ])
  })

  it('returns null when the verified report no longer exists', async () => {
    const harness = summaryHarness()
    harness.findUnique.mockResolvedValue(null)

    await expect(harness.repository.findPassengerCaseSummaryByReportId(reportId)).resolves.toBeNull()
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
