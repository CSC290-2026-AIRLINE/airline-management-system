import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { PassengerProfilesService } from './passenger-profiles.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const identity = {
  id: 'passenger-1',
  first_name: 'Anya',
  last_name: 'Saranpat',
  local_first_name: null,
  local_last_name: null,
  date_of_birth: new Date('1995-04-14T00:00:00Z'),
  gender: 'F',
  nationality: 'th',
  passport_number: null,
}
const customer = {
  id: 'customer-1',
  phone: '+66 812345678',
  profile_photo_url: null,
  user: { email: 'anya@example.com' },
  passenger: identity,
}
const saved = { id: 'link-1', relationship_type: 'spouse', passenger: { ...identity, id: 'saved-1', first_name: 'Somchai' } }
const createBody = {
  firstName: 'Somchai',
  lastName: 'Saranpat',
  dateOfBirth: '1992-08-12',
  gender: 'M',
  nationality: 'th',
  relationship: 'spouse',
}
function makeDatabase() {
  return {
    audit_log: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1', customer: [{ id: 'customer-1', deleted_at: null }] }) },
    customer: {
      findFirst: jest.fn().mockResolvedValue(customer),
      create: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    passenger: { create: jest.fn().mockResolvedValue({ id: 'saved-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    customer_passenger: {
      findFirst: jest.fn().mockResolvedValue(saved),
      findMany: jest.fn().mockResolvedValue([saved]),
      create: jest.fn().mockResolvedValue(saved),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  }
}

describe('PassengerProfilesService', () => {
  let db: ReturnType<typeof makeDatabase>
  let service: PassengerProfilesService
  beforeEach(() => {
    db = makeDatabase()
    db.$transaction.mockImplementation((operation: (tx: ReturnType<typeof makeDatabase>) => Promise<unknown>) => operation(db))
    service = new PassengerProfilesService(db as unknown as DbService)
  })

  it('loads only the active customer associated with the authenticated user', async () => {
    const result = await service.getProfile('user-1')
    expect(db.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 'user-1',
          deleted_at: null,
          user: { type: 'customer', deleted_at: null, disabled_at: null },
          passenger: { deleted_at: null },
        },
      }),
    )
    expect(result).toEqual({
      id: 'customer-1',
      needsIdentitySetup: false,
      firstName: 'Anya',
      lastName: 'Saranpat',
      localFirstName: null,
      localLastName: null,
      email: 'anya@example.com',
      phone: '+66 812345678',
      dateOfBirth: '1995-04-14',
      gender: 'F',
      nationality: 'th',
      profilePhotoUrl: null,
      passportNumber: null,
    })
    expect(result.passportNumber).toBeNull()
    expect(result).not.toHaveProperty('clerk_user_id')
  })

  it('rejects staff, deleted users and missing customer accounts without writing', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    await expect(service.createPassenger('staff-1', createBody)).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.passenger.create).not.toHaveBeenCalled()
    expect(db.audit_log.createMany).not.toHaveBeenCalled()
  })

  it('records a sensitive profile view before returning, without copying passport, DOB or names to audit', async () => {
    await service.getProfile('user-1')
    expect(db.audit_log.createMany).toHaveBeenCalledWith({
      data: [
        {
          occurred_at: expect.any(Date),
          actor_type: 'customer',
          actor_id: 'user-1',
          source_feature: '7',
          action: 'view_sensitive',
          entity_type: 'customer',
          entity_id: 'customer-1',
          is_sensitive: true,
        },
      ],
    })
    const data = JSON.stringify(db.audit_log.createMany.mock.calls[0][0])
    expect(data).not.toContain('Saranpat')
    expect(data).not.toContain('1995-04-14')
    expect(data).not.toContain('passport_number')
    expect(data).not.toContain('before')
    expect(data).not.toContain('after')
  })

  it('does not return personal details if recording the required audit fails', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    db.audit_log.createMany.mockRejectedValue(new Error('audit unavailable'))
    await expect(service.getProfile('user-1')).rejects.toBeInstanceOf(InternalServerErrorException)
    log.mockRestore()
  })

  it('audits only the returned passenger page in one bulk write', async () => {
    db.customer_passenger.findMany.mockResolvedValue([saved, { ...saved, id: 'link-2', passenger: { ...identity, id: 'not-returned' } }])
    await service.listPassengers('user-1', { limit: 1 })
    expect(db.audit_log.createMany).toHaveBeenCalledTimes(1)
    expect(db.audit_log.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ entity_type: 'passenger', entity_id: 'saved-1' })],
    })
    expect(JSON.stringify(db.audit_log.createMany.mock.calls[0][0])).not.toContain('not-returned')
  })

  it.each([{ dateOfBirth: '1990-01-01' }, { gender: 'M' }, { nationality: 'jp' }])(
    'rejects changes to initialized identity fields: %p',
    (body) => {
      expect(() => service.updateProfile('user-1', body)).toThrow(BadRequestException)
      expect(db.passenger.updateMany).not.toHaveBeenCalled()
    },
  )

  it('initializes previously-null identity fields in a serializable transaction', async () => {
    db.customer.findFirst.mockResolvedValueOnce({
      ...customer,
      passenger: { ...identity, date_of_birth: null, gender: null, nationality: null },
    })
    await service.completeIdentitySetup('user-1', {
      firstName: 'Anya',
      lastName: 'Saranpat',
      dateOfBirth: '1995-04-14',
      gender: 'F',
      nationality: 'th',
    })
    expect(db.passenger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'passenger-1', deleted_at: null, date_of_birth: null, gender: null, nationality: null },
        data: expect.objectContaining({ date_of_birth: new Date('1995-04-14T00:00:00Z'), gender: 'F', nationality: 'th' }),
      }),
    )
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
  })

  it('rejects a concurrent initialization rather than overwriting the first writer', async () => {
    db.passenger.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.updateProfile('user-1', { firstName: 'Changed' })).rejects.toBeInstanceOf(ConflictException)
    expect(db.customer.updateMany).not.toHaveBeenCalled()
  })

  it('rejects repeated setup even if the same values are sent', async () => {
    await expect(
      service.completeIdentitySetup('user-1', {
        firstName: 'Anya',
        lastName: 'Saranpat',
        dateOfBirth: '1995-04-14',
        gender: 'F',
        nationality: 'th',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(db.passenger.updateMany).not.toHaveBeenCalled()
  })

  it('creates passenger and customer atomically for a pending account with no fake names', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'user-1', customer: [] })
    await service.completeIdentitySetup('user-1', {
      firstName: 'Anya',
      lastName: 'Saranpat',
      dateOfBirth: '1995-04-14',
      gender: 'F',
      nationality: 'th',
    })
    expect(db.passenger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          first_name: 'Anya',
          last_name: 'Saranpat',
          date_of_birth: new Date('1995-04-14T00:00:00Z'),
          gender: 'F',
          nationality: 'th',
        },
      }),
    )
    expect(db.customer.create).toHaveBeenCalledWith({ data: { user_id: 'user-1', passenger_id: 'saved-1' } })
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
  })

  it('returns an explicit pending setup profile when only the local customer user exists', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    db.user.findFirst.mockResolvedValue({ email: 'owner@example.com' })
    const result = await service.getProfile('user-1')
    expect(result).toEqual(
      expect.objectContaining({ id: null, needsIdentitySetup: true, firstName: '', lastName: '', email: 'owner@example.com' }),
    )
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'customer', deleted_at: null, disabled_at: null, customer: { none: {} } }),
      }),
    )
  })

  it('does not expose a setup profile for staff or deleted customers', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    db.user.findFirst.mockResolvedValue(null)
    await expect(service.getProfile('staff-1')).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.audit_log.createMany).not.toHaveBeenCalled()
  })

  it('does not change previously initialized fields while finishing a partial setup', async () => {
    db.customer.findFirst.mockResolvedValueOnce({ ...customer, passenger: { ...identity, gender: null, nationality: null } })
    await expect(
      service.completeIdentitySetup('user-1', {
        firstName: 'Anya',
        lastName: 'Saranpat',
        dateOfBirth: '1990-01-01',
        gender: 'F',
        nationality: 'th',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(db.passenger.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an identity setup lost to a concurrent first save', async () => {
    db.customer.findFirst.mockResolvedValueOnce({ ...customer, passenger: { ...identity, gender: null } })
    db.passenger.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.completeIdentitySetup('user-1', {
        firstName: 'Anya',
        lastName: 'Saranpat',
        dateOfBirth: '1995-04-14',
        gender: 'F',
        nationality: 'th',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('updates profile fields atomically and returns the refreshed profile', async () => {
    db.customer.findFirst
      .mockResolvedValueOnce(customer)
      .mockResolvedValueOnce({ ...customer, phone: null, passenger: { ...identity, first_name: 'Changed' } })
    const result = await service.updateProfile('user-1', { firstName: 'Changed', phone: null })
    expect(db.passenger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ first_name: 'Changed' }) }),
    )
    expect(db.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'customer-1', deleted_at: null }, data: expect.objectContaining({ phone: null }) }),
    )
    expect(result.firstName).toBe('Changed')
    expect(result.phone).toBeNull()
  })

  it('removes only the customer photo URL', async () => {
    await service.updateProfile('user-1', { profilePhotoUrl: null })
    expect(db.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ profile_photo_url: null }) }),
    )
    expect(db.passenger.updateMany.mock.calls[0][0].data).not.toHaveProperty('passport_number')
  })

  it('saves the owner’s passport and local names on their own passenger row', async () => {
    await service.updateProfile('user-1', { passportNumber: 'AB12345', localFirstName: 'อัญญา', localLastName: 'สารพัฒน์' })
    expect(db.passenger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'passenger-1', deleted_at: null }),
        data: expect.objectContaining({ passport_number: 'AB12345', local_first_name: 'อัญญา', local_last_name: 'สารพัฒน์' }),
      }),
    )
    expect(db.customer_passenger.updateMany).not.toHaveBeenCalled()
  })

  it('allows the owner’s optional passport to be cleared without unlocking identity fields', async () => {
    await service.updateProfile('user-1', { passportNumber: null })
    expect(db.passenger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passport_number: null }) }),
    )
    expect(db.passenger.updateMany.mock.calls[0][0].data).not.toHaveProperty('gender')
  })

  it('rejects empty and entirely undefined patches', () => {
    expect(() => service.updateProfile('user-1', { firstName: undefined })).toThrow(BadRequestException)
    expect(() => service.updatePassenger('user-1', 'saved-1', {})).toThrow(BadRequestException)
  })

  it('paginates saved passengers with scoped relations and no per-row queries', async () => {
    db.customer_passenger.findMany.mockResolvedValue([saved, { ...saved, id: 'link-2' }])
    const result = await service.listPassengers('user-1', { limit: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBe('link-1')
    expect(result.items[0].id).toBe('saved-1')
    expect(db.customer_passenger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customer_id: 'customer-1', is_saved: true, passenger: { deleted_at: null } },
        take: 2,
      }),
    )
    expect(db.customer_passenger.findFirst).not.toHaveBeenCalled()
  })

  it('returns an empty page when no passengers are saved', async () => {
    db.customer_passenger.findMany.mockResolvedValue([])
    await expect(service.listPassengers('user-1', { limit: 50 })).resolves.toEqual({ items: [], nextCursor: null })
  })

  it('rejects a pagination cursor from another account', async () => {
    db.customer_passenger.findFirst.mockResolvedValue(null)
    await expect(service.listPassengers('user-1', { cursor: 'foreign-link', limit: 50 })).rejects.toBeInstanceOf(NotFoundException)
    expect(db.customer_passenger.findMany).not.toHaveBeenCalled()
  })

  it('creates the identity and saved association together', async () => {
    await service.createPassenger('user-1', createBody)
    expect(db.passenger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          first_name: 'Somchai',
          date_of_birth: new Date('1992-08-12T00:00:00Z'),
          gender: 'M',
          nationality: 'th',
        }),
      }),
    )
    expect(db.customer_passenger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          customer_id: 'customer-1',
          passenger_id: 'saved-1',
          relationship_type: 'spouse',
          is_saved: true,
        },
      }),
    )
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('does not edit another customer’s saved passenger', async () => {
    db.customer_passenger.findFirst.mockResolvedValue(null)
    await expect(service.updatePassenger('user-1', 'foreign-passenger', { firstName: 'Changed' })).rejects.toBeInstanceOf(NotFoundException)
    expect(db.passenger.updateMany).not.toHaveBeenCalled()
  })

  it('guards updates against shared identities and account-holder identities', async () => {
    await service.updatePassenger('user-1', 'saved-1', { relationship: 'parent', passportNumber: 'AB123' })
    expect(db.passenger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'saved-1',
          deleted_at: null,
          customer: null,
          customer_passenger: { every: { customer_id: 'customer-1' } },
        },
        data: expect.objectContaining({ passport_number: 'AB123' }),
      }),
    )
    expect(db.customer_passenger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ relationship_type: 'parent' }) }),
    )
  })

  it('rejects writes to shared identities', async () => {
    db.passenger.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.updatePassenger('user-1', 'saved-1', { firstName: 'Changed' })).rejects.toBeInstanceOf(ConflictException)
    expect(db.customer_passenger.updateMany).not.toHaveBeenCalled()
  })

  it('removes the saved association without deleting the passenger or historical links', async () => {
    await service.removePassenger('user-1', 'saved-1')
    expect(db.customer_passenger.updateMany).toHaveBeenCalledWith({
      where: {
        customer_id: 'customer-1',
        passenger_id: 'saved-1',
        is_saved: true,
        passenger: { deleted_at: null },
      },
      data: { is_saved: false, updated_at: expect.any(Date) },
    })
    expect(db.passenger.updateMany).not.toHaveBeenCalled()
    expect(db.passenger.create).not.toHaveBeenCalled()
  })

  it('returns not-found for foreign or already-removed passenger IDs', async () => {
    db.customer_passenger.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.removePassenger('user-1', 'foreign-passenger')).rejects.toBeInstanceOf(NotFoundException)
  })

  it.each(['P2002', 'P2003', 'P2034'])('maps database conflict %s without exposing internal data', async (code) => {
    db.$transaction.mockRejectedValue({ code, message: 'private database details' })
    await expect(service.createPassenger('user-1', createBody)).rejects.toBeInstanceOf(ConflictException)
  })

  it('hides unknown database errors', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    db.customer.findFirst.mockRejectedValue(new Error('secret database error'))
    await expect(service.getProfile('user-1')).rejects.toBeInstanceOf(InternalServerErrorException)
    expect(log).toHaveBeenCalledWith('Passenger profile database operation failed')
    log.mockRestore()
  })
})
