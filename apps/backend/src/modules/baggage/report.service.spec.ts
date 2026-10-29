import { ReportService } from './report.service'
import { InMemoryReportRepository } from './mocks/in-memory-report.repository'
import { InMemoryCaseNumberSequence } from './mocks/in-memory-case-number.sequence'
import { MockSimulationClock } from './mocks/mock-simulation.clock'
import { MockBookingVerification } from './mocks/mock-booking.verification'
import { MockCheckedBagLookup } from './mocks/mock-checked-bag.lookup'

describe('ReportService', () => {
  let service: ReportService

  const access = {
    bookingReference: 'ABC123',
    surname: 'Smith',
    passengerId: 'P001',
  }

  const validInput = {
    ...access,
    tagNumber: '0123456789',
    bagType: 'suitcase' as const,
    colour: 'black' as const,
    contactEmail: 'passenger@example.com',
  }

  beforeEach(() => {
    service = new ReportService(
      new InMemoryReportRepository(),
      new MockBookingVerification([
        {
          ...access,
          bookingPassengerId: 'BP001',
          flightId: 'F001',
        },
        {
          bookingReference: 'XYZ789',
          surname: 'Jones',
          passengerId: 'P002',
          bookingPassengerId: 'BP002',
          flightId: 'F002',
        },
      ]),
      new MockCheckedBagLookup([
        {
          tagNumber: '0123456789',
          bookingPassengerId: 'BP001',
        },
        {
          tagNumber: '0987654321',
          bookingPassengerId: 'BP002',
        },
      ]),
      new InMemoryCaseNumberSequence(),
      new MockSimulationClock(new Date('2026-10-29T10:00:00Z')),
    )
  })

  it('creates a report with a case number', async () => {
    const report = await service.create(validInput)

    expect(report.caseNumber).toBe('LB-2026-000001')
    expect(report.status).toBe('open')
    expect(report.bookingPassengerId).toBe('BP001')
  })

  it('rejects an invalid booking', async () => {
    await expect(
      service.create({
        ...validInput,
        bookingReference: 'WRONG',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REPORT',
    })
  })

  it('rejects an invalid baggage tag', async () => {
    await expect(
      service.create({
        ...validInput,
        tagNumber: '123',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_TAG',
    })
  })

  it('rejects a tag belonging to another passenger', async () => {
    await expect(
      service.create({
        ...validInput,
        tagNumber: '0987654321',
      }),
    ).rejects.toMatchObject({
      code: 'TAG_NOT_ON_BOOKING',
    })
  })

  it('rejects a duplicate live baggage report', async () => {
    await service.create(validInput)

    await expect(service.create(validInput)).rejects.toMatchObject({
      code: 'REPORT_EXISTS',
    })
  })

  it('requires at least one contact method', async () => {
    await expect(
      service.create({
        ...validInput,
        contactEmail: null,
        contactPhone: null,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REPORT',
    })
  })

  it('allows the owner to retrieve their report', async () => {
    const created = await service.create(validInput)

    const found = await service.getByCaseNumber(created.caseNumber, access)

    expect(found.id).toBe(created.id)
  })

  it('prevents another passenger from accessing a report', async () => {
    const created = await service.create(validInput)

    await expect(
      service.getByCaseNumber(created.caseNumber, {
        bookingReference: 'XYZ789',
        surname: 'Jones',
        passengerId: 'P002',
      }),
    ).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })
  })

  it('lists reports for the verified passenger', async () => {
    await service.create(validInput)

    const reports = await service.listMine(access)

    expect(reports).toHaveLength(1)
    expect(reports[0].bookingPassengerId).toBe('BP001')
  })
})
