import { ReportService } from './report.service'
import { InMemoryReportRepository } from './mocks/in-memory-report.repository'
import { InMemoryCaseNumberSequence } from './mocks/in-memory-case-number.sequence'
import { MockSimulationClock } from './mocks/mock-simulation.clock'
import { MockBookingVerification } from './mocks/mock-booking.verification'
import { MockCheckedBagLookup } from './mocks/mock-checked-bag.lookup'
import type { ReportRepository } from './common/report.ports'

describe('ReportService', () => {
  let service: ReportService
  let repository: InMemoryReportRepository
  let photos: { upload: jest.Mock; remove: jest.Mock; retrieve: jest.Mock }

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
    flightId: 'F001',
  }

  beforeEach(() => {
    repository = new InMemoryReportRepository()
    photos = { upload: jest.fn(), remove: jest.fn(), retrieve: jest.fn() }
    service = new ReportService(
      repository,
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
          flightId: 'F001',
        },
        {
          tagNumber: '0987654321',
          bookingPassengerId: 'BP002',
          flightId: 'F002',
        },
      ]),
      new InMemoryCaseNumberSequence(),
      new MockSimulationClock(new Date('2026-10-29T10:00:00Z')),
      photos,
    )
  })

  it('creates a report with a case number', async () => {
    const report = await service.create(validInput)

    expect(report.caseNumber).toBe('LB-2026-000001')
    expect(report.status).toBe('open')
    expect(report.bookingPassengerId).toBe('BP001')
    expect(report.photoUrl).toBeNull()
    expect(photos.upload).not.toHaveBeenCalled()
  })

  it('stores an optional photo only after booking authorization and persists a guarded photo path', async () => {
    const photo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', size: 3 }
    const report = await service.create({ ...validInput, reportedByCustomerId: 'CUSTOMER-1' }, photo)

    expect(photos.upload).toHaveBeenCalledWith(report.id, photo)
    expect(report.photoUrl).toBe(`/api/customer/lost-reports/${report.caseNumber}/photo`)
    expect(report.photoUrl).not.toContain(report.id)
  })

  it('does not store a photo when booking authorization fails', async () => {
    const photo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', size: 3 }

    await expect(service.create({ ...validInput, bookingReference: 'WRONG' }, photo)).rejects.toMatchObject({ code: 'INVALID_REPORT' })

    expect(photos.upload).not.toHaveBeenCalled()
    await expect(repository.listByBookingPassengerId('BP001')).resolves.toHaveLength(0)
  })

  it('cleans up the uploaded object when report persistence fails', async () => {
    const photo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', size: 3 }
    jest.spyOn(repository, 'create').mockRejectedValueOnce(new Error('database write failed'))

    await expect(service.create(validInput, photo)).rejects.toThrow('database write failed')

    expect(photos.upload).toHaveBeenCalledTimes(1)
    expect(photos.remove).toHaveBeenCalledWith(expect.any(String))
  })

  it('authorizes photo retrieval by booking ownership and report creator', async () => {
    const photo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', size: 3 }
    const created = await service.create({ ...validInput, reportedByCustomerId: 'CUSTOMER-1' }, photo)
    const photoObject = { body: {} as never, contentType: 'image/jpeg' as const }
    photos.retrieve.mockResolvedValue(photoObject)

    await expect(service.getPhotoForCaseNumber(created.caseNumber, access, 'CUSTOMER-1')).resolves.toBe(photoObject)
    expect(photos.retrieve).toHaveBeenCalledWith(created.id)

    photos.retrieve.mockClear()
    await expect(service.getPhotoForCaseNumber(created.caseNumber, access, 'CUSTOMER-2')).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })
    expect(photos.retrieve).not.toHaveBeenCalled()
  })

  it('does not retrieve a photo for reports without one', async () => {
    const created = await service.create({ ...validInput, reportedByCustomerId: 'CUSTOMER-1' })

    await expect(service.getPhotoForCaseNumber(created.caseNumber, access, 'CUSTOMER-1')).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })
    expect(photos.retrieve).not.toHaveBeenCalled()
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

  it('resolves a delivery only after verifying the passenger owns the case', async () => {
    const report = await service.create(validInput)
    const findDelivery = jest.spyOn(repository, 'findDeliveryIdByReportId').mockResolvedValue('delivery-123')

    await expect(service.getDeliveryIdForCaseNumber(report.caseNumber, access)).resolves.toBe('delivery-123')

    expect(findDelivery).toHaveBeenCalledWith(report.id)
  })

  it('does not resolve a delivery for an unauthorized case request', async () => {
    const report = await service.create(validInput)
    const findDelivery = jest.spyOn(repository, 'findDeliveryIdByReportId')

    await expect(
      service.getDeliveryIdForCaseNumber(report.caseNumber, {
        bookingReference: 'XYZ789',
        surname: 'Jones',
        passengerId: 'P002',
      }),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })

    expect(findDelivery).not.toHaveBeenCalled()
  })

  it('returns null when an authorized report has no delivery record', async () => {
    const report = await service.create(validInput)

    await expect(service.getDeliveryIdForCaseNumber(report.caseNumber, access)).resolves.toBeNull()
  })

  it('reads delivery choice only after verifying the passenger owns the report', async () => {
    const report = await service.create(validInput)
    const reportRepository: ReportRepository = repository
    const findChoice = jest.spyOn(reportRepository, 'findDeliveryChoiceByReportId').mockResolvedValue({
      deliveryType: 'hotel',
      address: 'Hotel Gracery',
      pickupAirport: null,
      status: 'preparing',
    })

    await expect(service.getDeliveryChoiceForCaseNumber(report.caseNumber, access)).resolves.toMatchObject({
      deliveryType: 'hotel',
      status: 'preparing',
    })
    expect(findChoice).toHaveBeenCalledWith(report.id)
  })

  it('does not read delivery choice for another passenger case', async () => {
    const report = await service.create(validInput)
    const findChoice = jest.spyOn(repository, 'findDeliveryChoiceByReportId')

    await expect(
      service.getDeliveryChoiceForCaseNumber(report.caseNumber, {
        bookingReference: 'XYZ789',
        surname: 'Jones',
        passengerId: 'P002',
      }),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    expect(findChoice).not.toHaveBeenCalled()
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

  it('rejects report access when the booking reference or surname does not verify', async () => {
    const created = await service.create(validInput)

    await expect(service.getByCaseNumber(created.caseNumber, { ...access, bookingReference: 'WRONG1' })).rejects.toMatchObject({
      code: 'INVALID_REPORT',
    })
    await expect(service.getByCaseNumber(created.caseNumber, { ...access, surname: 'Wrong' })).rejects.toMatchObject({
      code: 'INVALID_REPORT',
    })
  })

  it('returns not found for an invalid case identifier after valid booking verification', async () => {
    await expect(service.getByCaseNumber('not-a-case-number', access)).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })
  })

  it('lists reports for the verified passenger', async () => {
    await service.create(validInput)

    const reports = await service.listMine(access)

    expect(reports).toHaveLength(1)
    expect(reports[0].bookingPassengerId).toBe('BP001')
  })

  it('allows the owner to cancel an open report', async () => {
    const created = await service.create(validInput)

    const cancelled = await service.cancel(created.caseNumber, access)

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.closedAt).toBeInstanceOf(Date)

    const saved = await service.getByCaseNumber(created.caseNumber, access)
    expect(saved.status).toBe('cancelled')
  })

  it('prevents another passenger from cancelling a report', async () => {
    const created = await service.create(validInput)

    await expect(
      service.cancel(created.caseNumber, {
        bookingReference: 'XYZ789',
        surname: 'Jones',
        passengerId: 'P002',
      }),
    ).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })

    const saved = await service.getByCaseNumber(created.caseNumber, access)
    expect(saved.status).toBe('open')
  })

  it('rejects cancellation with invalid booking details', async () => {
    const created = await service.create(validInput)

    await expect(
      service.cancel(created.caseNumber, {
        ...access,
        bookingReference: 'INVALID',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REPORT',
    })
  })

  it('rejects cancelling an already cancelled report', async () => {
    const created = await service.create(validInput)

    await service.cancel(created.caseNumber, access)

    await expect(service.cancel(created.caseNumber, access)).rejects.toMatchObject({
      code: 'CANCELLATION_NOT_ALLOWED',
    })
  })
})

describe('ReportService.listEligibleTravellers', () => {
  const access = { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P001' }

  function serviceWith(listEligibleTravellers: jest.Mock) {
    const bookings = new MockBookingVerification()
    bookings.listEligibleTravellers = listEligibleTravellers
    return new ReportService(
      new InMemoryReportRepository(),
      bookings,
      new MockCheckedBagLookup([]),
      new InMemoryCaseNumberSequence(),
      new MockSimulationClock(),
      { upload: jest.fn(), remove: jest.fn(), retrieve: jest.fn() },
    )
  }

  it('returns the travellers on the verified booking', async () => {
    const travellers = [
      { bookingPassengerId: 'BP001', displayName: 'Anna Eriksson', isYou: true, flights: [] },
      { bookingPassengerId: 'BP002', displayName: 'Erik Eriksson', isYou: false, flights: [] },
    ]
    const list = jest.fn().mockResolvedValue(travellers)

    await expect(serviceWith(list).listEligibleTravellers(access)).resolves.toEqual(travellers)
    expect(list).toHaveBeenCalledWith(access)
  })

  it('rejects with the generic verification error when the requester is not on the booking', async () => {
    await expect(serviceWith(jest.fn().mockResolvedValue([])).listEligibleTravellers(access)).rejects.toMatchObject({
      code: 'INVALID_REPORT',
      message: 'Booking verification failed',
    })
  })
})

describe('MockBookingVerification.resolveTraveller', () => {
  const bookings = new MockBookingVerification([
    { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P001', bookingPassengerId: 'BP001', flightId: 'F001' },
    { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P002', bookingPassengerId: 'BP002', flightId: 'F001' },
    { bookingReference: 'XYZ789', surname: 'Jones', passengerId: 'P003', bookingPassengerId: 'BP003', flightId: 'F001' },
  ])
  const requester = { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P001' }

  it('resolves a co-traveller on the same booking', async () => {
    await expect(bookings.resolveTraveller({ ...requester, bookingPassengerId: 'BP002', flightId: 'F001' })).resolves.toEqual({
      bookingPassengerId: 'BP002',
      passengerId: 'P002',
      flightId: 'F001',
    })
  })

  it('rejects a traveller from an unrelated booking', async () => {
    await expect(bookings.resolveTraveller({ ...requester, bookingPassengerId: 'BP003', flightId: 'F001' })).resolves.toBeNull()
  })
})

describe('ReportService.create for another traveller ("Whose bag is it?")', () => {
  let service: ReportService
  let repository: InMemoryReportRepository
  let bookings: MockBookingVerification

  // Booking K7QX2M: reporter Anna (P001/BP001) and co-traveller Erik (P002/BP002), both on F001; Erik also on F003.
  // Booking XYZ789: unrelated passenger P009/BP009.
  const reporter = { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P001' }
  const bagDetails = { bagType: 'suitcase' as const, colour: 'black' as const, contactEmail: 'anna@example.com', flightId: 'F001' }

  beforeEach(() => {
    repository = new InMemoryReportRepository()
    bookings = new MockBookingVerification([
      { ...reporter, bookingPassengerId: 'BP001', flightId: 'F001' },
      { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P002', bookingPassengerId: 'BP002', flightId: 'F001' },
      { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P002', bookingPassengerId: 'BP002', flightId: 'F003' },
      { bookingReference: 'XYZ789', surname: 'Jones', passengerId: 'P009', bookingPassengerId: 'BP009', flightId: 'F001' },
    ])
    service = new ReportService(
      repository,
      bookings,
      new MockCheckedBagLookup([
        { tagNumber: '0111111111', bookingPassengerId: 'BP001', flightId: 'F001' },
        { tagNumber: '0222222222', bookingPassengerId: 'BP002', flightId: 'F001' },
      ]),
      new InMemoryCaseNumberSequence(),
      new MockSimulationClock(new Date('2026-10-29T10:00:00Z')),
      { upload: jest.fn(), remove: jest.fn(), retrieve: jest.fn() },
    )
  })

  it('own bag (bookingPassengerId omitted) still verifies the reporter and never resolves a traveller', async () => {
    const resolve = jest.spyOn(bookings, 'resolveTraveller')
    const report = await service.create({ ...reporter, ...bagDetails, reportedByCustomerId: 'C001' })

    expect(resolve).not.toHaveBeenCalled()
    expect(report).toMatchObject({ bookingPassengerId: 'BP001', passengerId: 'P001', flightId: 'F001', reportedByCustomerId: 'C001' })
  })

  it('own bag with bookingPassengerId null behaves exactly like omitted', async () => {
    const resolve = jest.spyOn(bookings, 'resolveTraveller')
    const report = await service.create({ ...reporter, ...bagDetails, bookingPassengerId: null, reportedByCustomerId: 'C001' })

    expect(resolve).not.toHaveBeenCalled()
    expect(report.bookingPassengerId).toBe('BP001')
  })

  it('reports for a co-traveller on the same booking, keeping the signed-in customer as reporter', async () => {
    const report = await service.create({ ...reporter, ...bagDetails, bookingPassengerId: 'BP002', reportedByCustomerId: 'C001' })

    expect(report).toMatchObject({
      bookingPassengerId: 'BP002',
      passengerId: 'P002',
      flightId: 'F001',
      reportedByCustomerId: 'C001',
      reportedByStaffId: null,
      status: 'open',
    })
  })

  it('selecting the reporter own bookingPassengerId gives the same result as the own-bag flow', async () => {
    const report = await service.create({ ...reporter, ...bagDetails, bookingPassengerId: 'BP001', reportedByCustomerId: 'C001' })

    expect(report).toMatchObject({ bookingPassengerId: 'BP001', passengerId: 'P001', reportedByCustomerId: 'C001' })
  })

  it('accepts a co-traveller flight the reporter is not on', async () => {
    const report = await service.create({ ...reporter, ...bagDetails, flightId: 'F003', bookingPassengerId: 'BP002' })

    expect(report).toMatchObject({ bookingPassengerId: 'BP002', flightId: 'F003' })
  })

  it.each([
    ['a traveller on an unrelated booking', { bookingPassengerId: 'BP009' }],
    ['an unknown traveller ID', { bookingPassengerId: 'BP-NOPE' }],
    ['an empty traveller ID', { bookingPassengerId: '' }],
    ['a flight the co-traveller holds no confirmed ticket for', { bookingPassengerId: 'BP002', flightId: 'F002' }],
    ['a reporter whose surname does not verify', { bookingPassengerId: 'BP002', surname: 'Wrong' }],
    ['a reporter on another booking reference', { bookingPassengerId: 'BP009', bookingReference: 'XYZ789' }],
  ])('rejects %s with the generic verification error and creates nothing', async (_label, override) => {
    await expect(service.create({ ...reporter, ...bagDetails, ...override, reportedByCustomerId: 'C001' })).rejects.toMatchObject({
      code: 'INVALID_REPORT',
      message: 'Booking verification failed',
    })
    for (const bp of ['BP001', 'BP002', 'BP009']) await expect(repository.listByBookingPassengerId(bp)).resolves.toHaveLength(0)
  })

  it('checks tag ownership against the selected bag owner: the co-traveller tag is accepted', async () => {
    const report = await service.create({ ...reporter, ...bagDetails, bookingPassengerId: 'BP002', tagNumber: '0222222222' })

    expect(report).toMatchObject({ bookingPassengerId: 'BP002', tagNumber: '0222222222' })
  })

  it('checks tag ownership against the selected bag owner: the reporter own tag is rejected for a co-traveller report', async () => {
    await expect(
      service.create({ ...reporter, ...bagDetails, bookingPassengerId: 'BP002', tagNumber: '0111111111' }),
    ).rejects.toMatchObject({ code: 'TAG_NOT_ON_BOOKING' })
  })

  it('applies the duplicate live-report rule to the co-traveller tag, whoever reports it', async () => {
    await service.create({ ...reporter, ...bagDetails, bookingPassengerId: 'BP002', tagNumber: '0222222222' })

    await expect(
      service.create({ ...reporter, ...bagDetails, bookingPassengerId: 'BP002', tagNumber: '0222222222' }),
    ).rejects.toMatchObject({ code: 'REPORT_EXISTS' })
  })
})

describe('ReportService case access for co-travellers (Stage 3)', () => {
  let service: ReportService
  let repository: InMemoryReportRepository
  let bookings: MockBookingVerification
  let photos: { upload: jest.Mock; remove: jest.Mock; retrieve: jest.Mock }

  // Booking K7QX2M: Anna (reporter, P001/BP001), Erik (bag owner, P002/BP002), Tom (third traveller, P004/BP004).
  // Booking XYZ789: unrelated passenger P009/BP009.
  const anna = { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P001' }
  const erik = { bookingReference: 'K7QX2M', surname: 'Eriksson', passengerId: 'P002' }
  const tom = { bookingReference: 'K7QX2M', surname: 'Berg', passengerId: 'P004' }
  const outsider = { bookingReference: 'XYZ789', surname: 'Jones', passengerId: 'P009' }
  const bag = { bagType: 'suitcase' as const, colour: 'black' as const, contactEmail: 'anna@example.com', contactPhone: '+66 81 000 0000' }

  beforeEach(() => {
    repository = new InMemoryReportRepository()
    photos = { upload: jest.fn(), remove: jest.fn(), retrieve: jest.fn() }
    bookings = new MockBookingVerification([
      { ...anna, bookingPassengerId: 'BP001', flightId: 'F001' },
      { ...erik, bookingPassengerId: 'BP002', flightId: 'F001' },
      { ...tom, bookingPassengerId: 'BP004', flightId: 'F001' },
      { ...outsider, bookingPassengerId: 'BP009', flightId: 'F001' },
    ])
    service = new ReportService(
      repository,
      bookings,
      new MockCheckedBagLookup([]),
      new InMemoryCaseNumberSequence(),
      new MockSimulationClock(new Date('2026-10-29T10:00:00Z')),
      photos,
    )
  })

  function reportForErik(withPhoto = false) {
    const photo = withPhoto ? { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', size: 3 } : undefined
    return service.create({ ...anna, ...bag, flightId: 'F001', bookingPassengerId: 'BP002', reportedByCustomerId: 'C-ANNA' }, photo)
  }

  describe('viewing (same booking)', () => {
    it('own bag: the owner sees the full report and no same-booking lookup runs', async () => {
      const own = await service.create({ ...anna, ...bag, flightId: 'F001', reportedByCustomerId: 'C-ANNA' })
      const lookup = jest.spyOn(bookings, 'isOnRequesterBooking')

      await expect(service.getByCaseNumber(own.caseNumber, anna)).resolves.toEqual(own)
      await expect(service.getViewableReport(own.caseNumber, anna)).resolves.toEqual({ report: own, isBagOwner: true })
      expect(lookup).not.toHaveBeenCalled()
    })

    it('the bag owner sees a report filed for them by a co-traveller, with contact details', async () => {
      const created = await reportForErik()

      await expect(service.getByCaseNumber(created.caseNumber, erik)).resolves.toEqual(created)
    })

    it('the reporter can open the co-traveller case they filed, without stored contact details', async () => {
      const created = await reportForErik()

      await expect(service.getByCaseNumber(created.caseNumber, anna)).resolves.toEqual({
        ...created,
        contactEmail: null,
        contactPhone: null,
      })
      await expect(service.getViewableReport(created.caseNumber, anna)).resolves.toMatchObject({ isBagOwner: false })
    })

    it('another verified traveller on the same booking (own surname) can view, without contact details', async () => {
      const created = await reportForErik()

      await expect(service.getByCaseNumber(created.caseNumber, tom)).resolves.toMatchObject({
        caseNumber: created.caseNumber,
        contactEmail: null,
        contactPhone: null,
      })
    })

    it('a passenger on an unrelated booking gets REPORT_NOT_FOUND', async () => {
      const created = await reportForErik()

      await expect(service.getByCaseNumber(created.caseNumber, outsider)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    })

    it('an outsider cannot borrow the booking reference with the wrong surname', async () => {
      const created = await reportForErik()

      await expect(service.getByCaseNumber(created.caseNumber, { ...outsider, bookingReference: 'K7QX2M' })).rejects.toMatchObject({
        code: 'INVALID_REPORT',
      })
    })

    it('an unknown case number on a verified booking gets REPORT_NOT_FOUND', async () => {
      await expect(service.getByCaseNumber('LB-2026-999999', anna)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    })
  })

  describe('actions stay owner-only (unchanged)', () => {
    it('a non-owner on the same booking cannot read or change the delivery choice', async () => {
      const created = await reportForErik()

      await expect(service.getDeliveryChoiceForCaseNumber(created.caseNumber, anna)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
      await expect(service.getDeliveryIdForCaseNumber(created.caseNumber, anna)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    })

    it('a non-owner on the same booking cannot cancel; the owner still can', async () => {
      const created = await reportForErik()

      await expect(service.cancel(created.caseNumber, anna)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
      await expect(service.cancel(created.caseNumber, erik)).resolves.toMatchObject({ status: 'cancelled' })
    })

    it('the owner keeps delivery-choice access', async () => {
      const created = await reportForErik()

      await expect(service.getDeliveryChoiceForCaseNumber(created.caseNumber, erik)).resolves.toBeNull()
    })

    it('the /mine listing is not widened: the reporter does not see the co-traveller case', async () => {
      await reportForErik()

      await expect(service.listMine(anna)).resolves.toHaveLength(0)
      await expect(service.listMine(erik)).resolves.toHaveLength(1)
    })
  })

  describe('photo: submitting customer only, within the same booking', () => {
    const photoObject = { body: {} as never, contentType: 'image/jpeg' as const }
    const photo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', size: 3 }

    beforeEach(() => photos.retrieve.mockResolvedValue(photoObject))

    it('1. own-bag reporter can still retrieve their photo', async () => {
      const own = await service.create({ ...anna, ...bag, flightId: 'F001', reportedByCustomerId: 'C-ANNA' }, photo)

      await expect(service.getPhotoForCaseNumber(own.caseNumber, anna, 'C-ANNA')).resolves.toBe(photoObject)
      expect(photos.retrieve).toHaveBeenCalledWith(own.id)
    })

    it('2. co-traveller reporter can retrieve the photo they uploaded for the bag owner', async () => {
      const created = await reportForErik(true)

      await expect(service.getPhotoForCaseNumber(created.caseNumber, anna, 'C-ANNA')).resolves.toBe(photoObject)
      expect(photos.retrieve).toHaveBeenCalledWith(created.id)
    })

    it('3. the bag owner who did not submit the report cannot retrieve that photo', async () => {
      const created = await reportForErik(true)

      await expect(service.getPhotoForCaseNumber(created.caseNumber, erik, 'C-ERIK')).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
      expect(photos.retrieve).not.toHaveBeenCalled()
    })

    it('4. another same-booking traveller cannot retrieve it', async () => {
      const created = await reportForErik(true)

      await expect(service.getPhotoForCaseNumber(created.caseNumber, tom, 'C-TOM')).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
      expect(photos.retrieve).not.toHaveBeenCalled()
    })

    it('5a. an unrelated customer cannot retrieve it, even when claiming the reporter customer ID', async () => {
      const created = await reportForErik(true)

      await expect(service.getPhotoForCaseNumber(created.caseNumber, outsider, 'C-ANNA')).rejects.toMatchObject({
        code: 'REPORT_NOT_FOUND',
      })
      expect(photos.retrieve).not.toHaveBeenCalled()
    })

    it('5b. an unverified customer (wrong surname on the booking) cannot retrieve it', async () => {
      const created = await reportForErik(true)

      await expect(service.getPhotoForCaseNumber(created.caseNumber, { ...anna, surname: 'Wrong' }, 'C-ANNA')).rejects.toMatchObject({
        code: 'INVALID_REPORT',
      })
      expect(photos.retrieve).not.toHaveBeenCalled()
    })

    it('the reporter cannot retrieve a photo that was never uploaded', async () => {
      const created = await reportForErik(false)

      await expect(service.getPhotoForCaseNumber(created.caseNumber, anna, 'C-ANNA')).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    })

    it('an empty caller customer ID never matches a report with no customer reporter', async () => {
      const staffStyle = await service.create({ ...anna, ...bag, flightId: 'F001' }, photo)

      await expect(service.getPhotoForCaseNumber(staffStyle.caseNumber, anna, '')).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    })
  })
})
