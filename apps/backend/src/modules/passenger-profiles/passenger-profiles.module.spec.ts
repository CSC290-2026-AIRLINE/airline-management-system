import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Server } from 'node:http'
import request from 'supertest'
import { DbService } from '@backend/db/db.service'
import { CustomerAccountProfilesService } from './customer-account-profiles.service'
import { PassengerProfilesService } from './passenger-profiles.service'
import { PassengerProfilesModule } from './passenger-profiles.module'
import { ProfileIdentityService } from './profile-identity.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./profile-identity.service', () => ({ ProfileIdentityService: class {} }))

describe('Combined F7 module route registration', () => {
  let app: INestApplication
  let customer: CustomerAccountProfilesService
  let staff: PassengerProfilesService
  const id = '11111111-1111-4111-8111-111111111111'
  const actor = { id: '22222222-2222-4222-8222-222222222222', email: 'owner@example.com' }
  const identity = { sync: jest.fn().mockResolvedValue({ source: 'clerk' }) }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PassengerProfilesModule] })
      .overrideProvider(DbService)
      .useValue({})
      .overrideProvider(ProfileIdentityService)
      .useValue(identity)
      .compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    // Authentication is covered by both controller suites; isolate route/DI wiring here.
    app.use((req: { user?: typeof actor }, _res: unknown, next: () => void) => {
      req.user = actor
      next()
    })
    await app.init()
    customer = module.get(CustomerAccountProfilesService)
    staff = module.get(PassengerProfilesService)
  })
  afterEach(() => jest.restoreAllMocks())
  afterAll(async () => {
    await app.close()
  })

  it('resolves distinct customer and staff services', () => {
    expect(customer).toBeInstanceOf(CustomerAccountProfilesService)
    expect(staff).toBeInstanceOf(PassengerProfilesService)
    expect(customer).not.toBe(staff)
  })
  it('routes the account owner read to the customer service', async () => {
    const own = jest.spyOn(customer, 'getProfile').mockResolvedValue({ source: 'customer' } as never)
    const staffRead = jest.spyOn(staff, 'getProfile')
    await request(app.getHttpServer() as Server)
      .get('/api/customers/me')
      .expect(200, { source: 'customer' })
    expect(own).toHaveBeenCalledWith(actor.id)
    expect(staffRead).not.toHaveBeenCalled()
  })
  it('routes the staff passenger read to the staff service', async () => {
    const staffRead = jest.spyOn(staff, 'getProfile').mockResolvedValue({ source: 'staff' } as never)
    const own = jest.spyOn(customer, 'getProfile')
    await request(app.getHttpServer() as Server)
      .get('/api/staff/passengers/' + id)
      .expect(200, { source: 'staff' })
    expect(staffRead).toHaveBeenCalledWith(id, actor)
    expect(own).not.toHaveBeenCalled()
  })
  it('keeps the staff account-holder controller registered', async () => {
    const read = jest.spyOn(staff, 'getAccountHolder').mockResolvedValue({ source: 'staff-account' } as never)
    await request(app.getHttpServer() as Server)
      .get('/api/staff/customers/' + id)
      .expect(200, { source: 'staff-account' })
    expect(read).toHaveBeenCalledWith(id, actor)
  })
  it('keeps first-sign-in identity setup on the customer service', async () => {
    const setup = jest.spyOn(customer, 'completeIdentitySetup').mockResolvedValue({ needsIdentitySetup: false } as never)
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me/identity')
      .send({ firstName: 'Anya', lastName: 'Saranpat', dateOfBirth: '1995-04-14', gender: 'F', nationality: 'th' })
      .expect(200, { needsIdentitySetup: false })
    expect(setup).toHaveBeenCalledWith(actor.id, expect.objectContaining({ nationality: 'th' }))
  })
  it('keeps customer email/photo synchronization registered', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/customers/me/sync-identity')
      .expect(200, { source: 'clerk' })
    expect(identity.sync).toHaveBeenCalledWith(actor.id)
  })
})
