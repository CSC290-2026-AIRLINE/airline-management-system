jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

import type { DbService } from '@backend/db/db.service'
import type { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { DemoBookingCustomerService } from './demo-booking-customer.service'

function fixture(environment = 'development', isStaff = true) {
  const staff = jest.fn(() => Promise.resolve(isStaff ? { id: 'agent' } : null))
  const customers = jest.fn(() =>
    Promise.resolve([
      {
        id: 'customer',
        phone: '000',
        passenger: { first_name: 'Feature', last_name: 'Traveller' },
        user: { email: 'fixture@example.com' },
      },
    ]),
  )
  const service = new DemoBookingCustomerService(
    { staff: { findFirst: staff }, customer: { findMany: customers } } as unknown as DbService,
    { get: () => environment } as unknown as ConfigService<EnvConfig, true>,
  )
  return { service, staff, customers }
}

describe('DemoBookingCustomerService', () => {
  it('returns only the seeded customer after checking active staff membership', async () => {
    const { service, staff, customers } = fixture()
    expect(await service.list('staff-user')).toEqual([
      { id: 'customer', name: 'Feature Traveller', email: 'fixture@example.com', phone: '000' },
    ])
    expect(staff).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'staff-user', deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      }),
    )
    expect(customers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deleted_at: null, user: { clerk_user_id: 'f03-seed-customer', type: 'customer', disabled_at: null, deleted_at: null } },
      }),
    )
  })
  it('denies customer accounts before reading customer data', async () => {
    const { service, customers } = fixture('development', false)
    await expect(service.list('customer-user')).rejects.toMatchObject({ status: 403 })
    expect(customers).not.toHaveBeenCalled()
  })
  it.each(['production', 'test', ''])('returns 404 without database access in %s', async (environment) => {
    const { service, staff, customers } = fixture(environment)
    await expect(service.list('any-user')).rejects.toMatchObject({ status: 404 })
    expect(staff).not.toHaveBeenCalled()
    expect(customers).not.toHaveBeenCalled()
  })
})
