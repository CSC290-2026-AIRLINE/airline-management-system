import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { CheckinBoardingModule } from './checkin-boarding.module'
import { SPECIMEN_LINE1, buildSpecimenLine2 } from './domain/mrz'
import { STAFF_IDENTITY } from './providers/providers'

// The generated Prisma client is ESM only and the module never talks to a real database here.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const CUSTOMER = 'user-anna'
const STAFF = 'staff-demo'

/** The platform has no staff guard yet, so the spec decides who is staff. */
const staffByUser = (user: { id: string }): { isStaff: boolean; staffId: string | null } =>
  user.id === STAFF ? { isStaff: true, staffId: 'staff-demo' } : { isStaff: false, staffId: null }

interface TestRequest extends Request {
  user?: { id: string; email: string }
}

/** The platform's JWT guard is not loaded: the spec signs a user in with a header instead. */
async function startApp(resolve: (user: { id: string }) => { isStaff: boolean; staffId: string | null }): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [CheckinBoardingModule] })
    .overrideProvider(STAFF_IDENTITY)
    .useValue({ resolve })
    .compile()
  const app = moduleRef.createNestApplication()
  app.use((req: TestRequest, _res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user']
    if (typeof id === 'string' && id.length > 0) req.user = { id, email: `${id}@example.com` }
    next()
  })
  await app.init()
  return app
}

let app: INestApplication
let req: ReturnType<typeof request>

beforeEach(async () => {
  app = await startApp(staffByUser)
  req = request(app.getHttpServer())
})

afterEach(async () => {
  await app.close()
})

describe('customer routes', () => {
  it('POST /check-ins starts and GET returns it; unknown id is a 404 envelope', async () => {
    const r = await req.post('/check-ins').set('x-test-user', CUSTOMER).send({ pnr: 'ER204F', lastName: 'Eriksson' }).expect(201)
    expect(r.body.status).toBe('started')
    await req.get(`/check-ins/${r.body.id}`).set('x-test-user', CUSTOMER).expect(200)
    const e = await req.get('/check-ins/nope').set('x-test-user', CUSTOMER).expect(404)
    expect(e.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } })
  })

  it('validation errors use the envelope with the field', async () => {
    const e = await req.post('/check-ins').set('x-test-user', CUSTOMER).send({ pnr: 'ER204F' }).expect(400)
    expect(e.body.error).toMatchObject({ code: 'VALIDATION', details: { field: 'lastName' } })
  })

  it('full passenger flow over HTTP: document, seat-lock, seat, baggage, complete, boarding-pass', async () => {
    const started = await req.post('/check-ins').set('x-test-user', CUSTOMER).send({ pnr: 'ER204F', lastName: 'Eriksson' }).expect(201)
    const id = started.body.id

    const document = await req
      .put(`/check-ins/${id}/document`)
      .set('x-test-user', CUSTOMER)
      .send({ mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
      .expect(200)
    expect(document.body.steps.document).toBe(true)

    const lock = await req
      .post('/flights/flt-fy204/seat-locks')
      .set('x-test-user', CUSTOMER)
      .send({ checkInId: id, seatCode: '15A' })
      .expect(201)
    const seat = await req.put(`/check-ins/${id}/seat`).set('x-test-user', CUSTOMER).send({ lockId: lock.body.id }).expect(200)
    expect(seat.body.seat.code).toBe('15A')

    const bags = await req.put(`/check-ins/${id}/baggage`).set('x-test-user', CUSTOMER).send({ declaredBags: 1 }).expect(200)
    expect(bags.body.declaredBags).toBe(1)

    const pass = await req.post(`/check-ins/${id}/complete`).set('x-test-user', CUSTOMER).expect(201)
    expect(pass.body.gate).toBe('A1')
    expect(pass.body.boardingGroup).toBe(4)

    const again = await req.get(`/check-ins/${id}/boarding-pass`).set('x-test-user', CUSTOMER).expect(200)
    expect(again.body.reference).toBe(pass.body.reference)
  })

  it('the seat map is public', async () => {
    await req.get('/flights/flt-fy204/seat-map').expect(200)
  })
})

describe('staff routes', () => {
  it('staff: search, detail, weigh, tag, gate list, scan, headcount, close', async () => {
    const search = await req.get('/staff/check-ins?flightId=flt-fy204').set('x-test-user', STAFF).expect(200)
    expect(search.body.length).toBeGreaterThan(0)
    const row = search.body[0]

    const detail = await req.get(`/staff/check-ins/${row.id}`).set('x-test-user', STAFF).expect(200)
    expect(detail.body.checkIn.booking.pnr).toBe(row.pnr)

    const weighed = await req
      .post(`/staff/check-ins/${row.id}/bags`)
      .set('x-test-user', STAFF)
      .send({ weightKg: 12.34, lengthCm: 60, widthCm: 40, heightCm: 20 })
      .expect(201)
    expect(weighed.body.bags).toHaveLength(1)

    const tagged = await req.post(`/staff/bags/${weighed.body.bags[0].id}/tag`).set('x-test-user', STAFF).expect(201)
    expect(tagged.body.bag.tagNumber).toBe('0402000001')

    const lookup = await req.get('/staff/bags/0402000001').set('x-test-user', STAFF).expect(200)
    expect(lookup.body.pnr).toBe(row.pnr)

    const gateList = await req.get('/staff/gates/gate-a1/flights/flt-fy204/passengers').set('x-test-user', STAFF).expect(200)
    expect(gateList.body.gate.code).toBe('A1')

    const scan = await req
      .post('/staff/gates/gate-a1/scans')
      .set('x-test-user', STAFF)
      .send({ flightId: 'flt-fy204', reference: 'R8KD2WQN' })
      .expect(201)
    expect(scan.body.event).toBe('boarded')

    const head = await req
      .put('/staff/flights/flt-fy204/headcount')
      .set('x-test-user', STAFF)
      .send({ source: 'manual', count: 1 })
      .expect(200)
    expect(head.body.manualCount).toBe(1)

    const closed = await req
      .post('/staff/flights/flt-fy204/close-gate')
      .set('x-test-user', STAFF)
      .send({ confirmMismatch: true })
      .expect(201)
    expect(closed.body.closedAt).toBe('2026-11-11T01:00:00.000Z')
  })

  it('staff: the counter extras (carry-on, print, gate change, flights and gates)', async () => {
    const search = await req.get('/staff/check-ins?pnr=PL204A').set('x-test-user', STAFF).expect(200)
    const row = search.body[0]

    const carryOn = await req
      .put(`/staff/check-ins/${row.id}/carry-on`)
      .set('x-test-user', STAFF)
      .send({ weightKg: 6, lengthCm: 50, widthCm: 30, heightCm: 20 })
      .expect(200)
    expect(carryOn.body.carryOnCheck.result).toBe('ok')

    const detail = await req.get(`/staff/check-ins/${row.id}`).set('x-test-user', STAFF).expect(200)
    const print = await req.post(`/staff/boarding-passes/${detail.body.boardingPass.id}/print`).set('x-test-user', STAFF).expect(201)
    expect(print.body.printedAt).toBe('2026-11-11T01:00:00.000Z')

    const moved = await req.put('/staff/flights/flt-fy204/gate').set('x-test-user', STAFF).send({ gateId: 'gate-a2' }).expect(200)
    expect(moved.body.gate.code).toBe('A2')

    expect((await req.get('/staff/gates').set('x-test-user', STAFF).expect(200)).body).toHaveLength(2)
    expect((await req.get('/staff/flights').set('x-test-user', STAFF).expect(200)).body).toHaveLength(2)
    expect((await req.get('/staff/flights/flt-fy204/bags').set('x-test-user', STAFF).expect(200)).body).toEqual([])
  })

  it('a customer may not read the counter of another passenger', async () => {
    const search = await req.get('/staff/check-ins?pnr=PL204A').set('x-test-user', STAFF).expect(200)
    const row = search.body[0]
    const e = await req.get(`/staff/check-ins/${row.id}`).set('x-test-user', CUSTOMER).expect(403)
    expect(e.body.error).toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('the staff guard', () => {
  it('refuses a non-staff user but lets the customer route through', async () => {
    const customerApp = await startApp(() => Promise.resolve({ isStaff: false, staffId: null }))
    try {
      const r = request(customerApp.getHttpServer())
      const e = await r.get('/staff/gates').set('x-test-user', CUSTOMER).expect(403)
      expect(e.body.error).toMatchObject({ code: 'FORBIDDEN' })
      await r.post('/check-ins').set('x-test-user', CUSTOMER).send({ pnr: 'ER204F', lastName: 'Eriksson' }).expect(201)
    } finally {
      await customerApp.close()
    }
  })
})
