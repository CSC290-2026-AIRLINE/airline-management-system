import 'reflect-metadata'
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import type { BookingReadPort, BookingListQuery } from '../contracts'
import { StaffBookingLookupService } from './staff-booking-lookup.service'
import { StaffBookingQueryDto } from './staff-booking-query.dto'

function fixture(isStaff = true) {
  const staff = jest.fn(() => Promise.resolve(isStaff ? { id: 'staff' } : null))
  const list = jest.fn((query: BookingListQuery) => Promise.resolve({ items: [], page: query.page, pageSize: query.pageSize, total: 0 }))
  const detail = jest.fn(() => Promise.resolve(null as unknown))
  const service = new StaffBookingLookupService(
    { staff: { findFirst: staff } } as unknown as DbService,
    { listStaffBookings: list, getBookingDetail: detail } as unknown as BookingReadPort,
  )
  return { service, staff, list, detail }
}

describe('StaffBookingLookupService', () => {
  it('denies customers before touching the booking read port', async () => {
    const { service, list, detail } = fixture(false)
    await expect(service.list('customer', {})).rejects.toMatchObject({ status: 403 })
    await expect(service.detail('customer', 'ABC234')).rejects.toMatchObject({ status: 403 })
    expect(list).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
  })
  it('ignores every filter when trimmed search text is present and preserves paging', async () => {
    const { service, list } = fixture()
    await service.list('agent', {
      search: '  Passenger name  ',
      from: 'invalid',
      to: 'invalid',
      status: 'cancelled',
      dateType: 'travelling',
      flightId: 'flight',
      page: 3,
      pageSize: 10,
    })
    expect(list).toHaveBeenCalledWith({ search: 'Passenger name', page: 3, pageSize: 10 })
  })
  it('passes inclusive UTC date bounds, status and flight to B when search is empty', async () => {
    const { service, list } = fixture()
    await service.list('agent', {
      search: '  ',
      dateType: 'travelling',
      from: '2026-11-01',
      to: '2026-11-30',
      status: 'held',
      flightId: 'flight',
    })
    expect(list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      dateType: 'travelling',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-30T23:59:59.999Z'),
      status: 'held',
      flightId: 'flight',
    })
  })
  it('rejects reversed date bounds without making a read request', async () => {
    const { service, list } = fixture()
    await expect(service.list('agent', { from: '2026-12-01', to: '2026-11-01' })).rejects.toMatchObject({ status: 400 })
    expect(list).not.toHaveBeenCalled()
  })
  it('returns the read port page without re-sorting or leaking through another data source', async () => {
    const { service } = fixture()
    expect(await service.list('agent', { page: 2, pageSize: 5 })).toEqual({ items: [], page: 2, pageSize: 5, total: 0 })
  })
  it('normalizes a reference and requests the staff view of detail/history', async () => {
    const { service, detail } = fixture()
    const booking = { reference: 'ABC234', history: [{ event: 'held' }] }
    detail.mockResolvedValueOnce(booking)
    expect(await service.detail('agent', ' abc234 ')).toBe(booking)
    expect(detail).toHaveBeenCalledWith('ABC234', { staff: true })
  })
  it('returns 404 for unknown or malformed references', async () => {
    const { service, detail } = fixture()
    await expect(service.detail('agent', 'ABC234')).rejects.toMatchObject({ status: 404 })
    detail.mockClear()
    await expect(service.detail('agent', 'invalid')).rejects.toMatchObject({ status: 404 })
    expect(detail).not.toHaveBeenCalled()
  })
  it('checks both staff membership and the active user account', async () => {
    const { service, staff } = fixture()
    await service.list('agent', {})
    expect(staff).toHaveBeenCalledWith({
      where: { user_id: 'agent', deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
  })
})

describe('StaffBookingQueryDto', () => {
  it.each([
    { page: '0' },
    { pageSize: '101' },
    { page: 'x' },
    { from: '2026-02-30' },
    { status: 'invalid' },
    { dateType: 'invalid' },
    { flightId: 'bad' },
  ])('rejects invalid active criteria: %#', async (input) => {
    expect(await validate(plainToInstance(StaffBookingQueryDto, input))).not.toHaveLength(0)
  })
  it('allows irrelevant malformed filters when search is active', async () => {
    expect(
      await validate(
        plainToInstance(StaffBookingQueryDto, {
          search: 'ABC234',
          from: 'bad',
          to: 'bad',
          status: 'bad',
          flightId: 'bad',
          dateType: 'bad',
          page: '2',
        }),
      ),
    ).toHaveLength(0)
  })
  it('validates filters for whitespace-only search text', async () => {
    expect(await validate(plainToInstance(StaffBookingQueryDto, { search: '   ', from: 'bad' }))).not.toHaveLength(0)
  })
})
