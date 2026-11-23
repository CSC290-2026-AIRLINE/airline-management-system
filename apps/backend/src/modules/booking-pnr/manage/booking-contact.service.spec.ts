import type { DbService } from '@backend/db/db.service'
import type { BookingClock, BookingReadPort } from '../contracts'
import { BookingContactService } from './booking-contact.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('BookingContactService', () => {
  const NOW = new Date('2026-11-01T10:00:00.000Z')
  const EXPIRES = new Date('2026-11-01T10:15:00.000Z')
  const heldBooking = { id: 'booking', status: 'held', hold_expires_at: EXPIRES }
  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve([heldBooking])),
    booking: { update: jest.fn().mockResolvedValue({}) },
  }
  const db = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    customer: { findFirst: jest.fn(() => Promise.resolve(null)) },
    staff: { findFirst: jest.fn(() => Promise.resolve(null)) },
  }
  const bookings = { getBookingDetail: jest.fn(() => Promise.resolve({ reference: 'ABC123', status: 'held' })) }
  const clock: BookingClock = { now: () => NOW }
  const service = new BookingContactService(db as unknown as DbService, clock, bookings as unknown as BookingReadPort)

  beforeEach(() => {
    jest.resetAllMocks()
    db.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx))
    tx.$queryRaw.mockResolvedValue([heldBooking])
    tx.booking.update.mockResolvedValue({})
    db.customer.findFirst.mockResolvedValue(null)
    db.staff.findFirst.mockResolvedValue(null)
    bookings.getBookingDetail.mockResolvedValue({ reference: 'ABC123', status: 'held' })
  })

  it('changes the email and the phone of a booking that is on hold', async () => {
    await expect(service.updateContact('ABC123', { contactEmail: 'new@example.com', contactPhone: '+66 2 123 4567' })).resolves.toEqual({
      contactEmail: 'new@example.com',
      contactPhone: '+66 2 123 4567',
    })
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'booking' },
        data: expect.objectContaining({ contact_email: 'new@example.com', contact_phone: '+66 2 123 4567' }),
      }),
    )
  })

  it('clears the phone number when the customer sends none', async () => {
    await expect(service.updateContact('ABC123', { contactEmail: 'new@example.com' })).resolves.toEqual({
      contactEmail: 'new@example.com',
      contactPhone: null,
    })
    expect(tx.booking.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contact_phone: null }) }))
  })

  it('refuses a booking that is no longer on hold', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'booking', status: 'confirmed', hold_expires_at: EXPIRES }])
    await expect(service.updateContact('ABC123', { contactEmail: 'new@example.com' })).rejects.toMatchObject({
      code: 'BOOKING_CLOSED',
      status: 409,
    })
    expect(tx.booking.update).not.toHaveBeenCalled()
  })

  it('refuses a booking whose hold has expired', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'booking', status: 'held', hold_expires_at: new Date('2026-11-01T09:00:00.000Z') }])
    await expect(service.updateContact('ABC123', { contactEmail: 'new@example.com' })).rejects.toMatchObject({
      code: 'BOOKING_CLOSED',
      status: 409,
    })
    expect(tx.booking.update).not.toHaveBeenCalled()
  })

  it('answers 404 for a reference that does not exist', async () => {
    tx.$queryRaw.mockResolvedValue([])
    await expect(service.updateContact('NOPE', { contactEmail: 'new@example.com' })).rejects.toMatchObject({
      code: 'INVALID_BOOKING_STATE',
      status: 404,
    })
  })

  it('lets a customer change its own booking', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'customer-1' })
    await expect(service.updateContactForUser('ABC123', { contactEmail: 'new@example.com' }, 'user-1')).resolves.toMatchObject({
      contactEmail: 'new@example.com',
    })
    expect(bookings.getBookingDetail).toHaveBeenCalledWith('ABC123', { customerId: 'customer-1' })
  })

  it("does not let a customer change another customer's booking", async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'customer-1' })
    bookings.getBookingDetail.mockResolvedValue(null)
    await expect(service.updateContactForUser('ABC123', { contactEmail: 'new@example.com' }, 'user-1')).rejects.toMatchObject({
      code: 'INVALID_BOOKING_STATE',
      status: 404,
    })
    expect(tx.booking.update).not.toHaveBeenCalled()
  })

  it('lets staff change the contact details of any booking', async () => {
    db.staff.findFirst.mockResolvedValue({ id: 'staff-1' })
    await expect(service.updateContactForUser('ABC123', { contactEmail: 'new@example.com' }, 'user-1')).resolves.toMatchObject({
      contactEmail: 'new@example.com',
    })
    expect(bookings.getBookingDetail).toHaveBeenCalledWith('ABC123', { staff: true })
  })

  it('answers 404 for a caller without a customer profile or a staff account', async () => {
    await expect(service.updateContactForUser('ABC123', { contactEmail: 'new@example.com' }, 'user-1')).rejects.toMatchObject({
      code: 'INVALID_BOOKING_STATE',
      status: 404,
    })
    expect(tx.booking.update).not.toHaveBeenCalled()
  })
})
