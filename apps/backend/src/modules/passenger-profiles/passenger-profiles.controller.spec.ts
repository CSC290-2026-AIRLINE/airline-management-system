import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import type { Server } from 'node:http'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { PassengerProfilesController } from './passenger-profiles.controller'
import { PassengerProfilesService } from './passenger-profiles.service'
import { ProfileIdentityService } from './profile-identity.service'
import { CustomerIdentityController } from './customer-identity.controller'

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./profile-identity.service', () => ({ ProfileIdentityService: class {} }))

const passengerId = '11111111-1111-4111-8111-111111111111'

describe('Passenger profile HTTP boundary', () => {
  let app: INestApplication
  const service = {
    completeIdentitySetup: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    listPassengers: jest.fn(),
    createPassenger: jest.fn(),
    updatePassenger: jest.fn(),
    removePassenger: jest.fn(),
  }
  const jwt = { verifyAsync: jest.fn() }
  const identity = { sync: jest.fn() }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PassengerProfilesController, CustomerIdentityController],
      providers: [
        { provide: PassengerProfilesService, useValue: service },
        { provide: ProfileIdentityService, useValue: identity },
        { provide: JwtService, useValue: jwt },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()
  })
  beforeEach(() => {
    jest.clearAllMocks()
    jwt.verifyAsync.mockResolvedValue({ sub: 'authenticated-user', email: 'owner@example.com' })
    service.getProfile.mockResolvedValue({ id: 'owned-profile' })
    service.updateProfile.mockResolvedValue({ id: 'owned-profile' })
    service.createPassenger.mockResolvedValue({ id: passengerId })
    service.removePassenger.mockResolvedValue(undefined)
    service.completeIdentitySetup.mockResolvedValue({ needsIdentitySetup: false })
    identity.sync.mockResolvedValue({ email: 'verified@example.com' })
  })
  afterAll(async () => {
    await app.close()
  })

  it('synchronizes only the authenticated identity, ignoring browser-supplied IDs and emails', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/customers/me/sync-identity')
      .set('Authorization', 'Bearer valid')
      .send({ userId: 'another-user', email: 'fake@example.com' })
      .expect(200)
    expect(identity.sync).toHaveBeenCalledWith('authenticated-user')
  })

  it('syncs the authenticated owner photo through the PUT photo route', async () => {
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me/photo')
      .set('Authorization', 'Bearer valid')
      .expect(200)
    expect(identity.sync).toHaveBeenCalledWith('authenticated-user')
  })

  it('updates profile details through PUT', async () => {
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me')
      .set('Authorization', 'Bearer valid')
      .send({ phone: '+66812345678' })
      .expect(200)
    expect(service.updateProfile).toHaveBeenCalledWith('authenticated-user', expect.objectContaining({ phone: '+66812345678' }))
  })

  it('requires the existing Bearer authentication guard', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/customers/me')
      .expect(401)
    expect(service.getProfile).not.toHaveBeenCalled()
  })

  it('protects the dedicated setup endpoint with the existing JWT guard', async () => {
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me/identity')
      .send({})
      .expect(401)
    expect(service.completeIdentitySetup).not.toHaveBeenCalled()
  })

  it('requires all first sign-in identity fields together', async () => {
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me/identity')
      .set('Authorization', 'Bearer valid')
      .send({ dateOfBirth: '1995-04-14' })
      .expect(400)
    expect(service.completeIdentitySetup).not.toHaveBeenCalled()
  })

  it('validates the setup contract and supplies only the authenticated owner ID', async () => {
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me/identity')
      .set('Authorization', 'Bearer valid')
      .send({ firstName: ' Anya ', lastName: 'Saranpat', dateOfBirth: '1995-04-14', gender: 'F', nationality: 'TH' })
      .expect(200)
    expect(service.completeIdentitySetup).toHaveBeenCalledWith(
      'authenticated-user',
      expect.objectContaining({ firstName: 'Anya', nationality: 'th', gender: 'F' }),
    )
  })

  it('rejects owner-ID injection in identity setup', async () => {
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me/identity')
      .set('Authorization', 'Bearer valid')
      .send({
        firstName: 'Anya',
        lastName: 'Saranpat',
        dateOfBirth: '1995-04-14',
        gender: 'F',
        nationality: 'th',
        customerId: 'another-user',
      })
      .expect(400)
    expect(service.completeIdentitySetup).not.toHaveBeenCalled()
  })
  it('rejects invalid tokens before accessing profile data', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('invalid'))
    await request(app.getHttpServer() as Server)
      .get('/api/customers/me')
      .set('Authorization', 'Bearer invalid')
      .expect(401)
    expect(service.getProfile).not.toHaveBeenCalled()
  })
  it('uses the authenticated user ID for profile reads', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/customers/me')
      .set('Authorization', 'Bearer valid')
      .expect(200, { id: 'owned-profile' })
    expect(service.getProfile).toHaveBeenCalledWith('authenticated-user')
  })
  it('rejects user-ID injection and email changes at the HTTP boundary', async () => {
    await request(app.getHttpServer() as Server)
      .put('/api/customers/me')
      .set('Authorization', 'Bearer valid')
      .send({ userId: 'another-user', email: 'changed@example.com' })
      .expect(400)
    expect(service.updateProfile).not.toHaveBeenCalled()
  })
  it('validates and normalizes create data before invoking the service', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/customers/me/passengers')
      .set('Authorization', 'Bearer valid')
      .send({
        firstName: ' SOMCHAI ',
        lastName: 'SARANPAT',
        relationship: 'spouse',
        dateOfBirth: '1992-08-12',
        gender: 'M',
        nationality: 'TH',
      })
      .expect(201)
    expect(service.createPassenger).toHaveBeenCalledWith(
      'authenticated-user',
      expect.objectContaining({ firstName: 'SOMCHAI', nationality: 'th' }),
    )
  })
  it('rejects locked saved-passenger fields before invoking the service', async () => {
    await request(app.getHttpServer() as Server)
      .put(`/api/customers/me/passengers/${passengerId}`)
      .set('Authorization', 'Bearer valid')
      .send({ gender: 'F' })
      .expect(400)
    expect(service.updatePassenger).not.toHaveBeenCalled()
  })
  it('rejects malformed passenger IDs', async () => {
    await request(app.getHttpServer() as Server)
      .delete('/api/customers/me/passengers/not-a-uuid')
      .set('Authorization', 'Bearer valid')
      .expect(400)
    expect(service.removePassenger).not.toHaveBeenCalled()
  })
  it('returns 204 when removing the authenticated customer’s saved passenger', async () => {
    await request(app.getHttpServer() as Server)
      .delete(`/api/customers/me/passengers/${passengerId}`)
      .set('Authorization', 'Bearer valid')
      .expect(204)
    expect(service.removePassenger).toHaveBeenCalledWith('authenticated-user', passengerId)
  })
})
