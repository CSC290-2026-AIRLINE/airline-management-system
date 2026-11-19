import { StationContactService } from './station-contact.service'
import type { DbService } from '@backend/db/db.service'
import type { AuditActor, AuditService } from '@backend/modules/admin-console/audit/audit.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const UPDATED = new Date('2026-11-07T09:00:00Z')

function row(airportCode = 'BKK') {
  return {
    airport_code: airportCode,
    desk_name: 'Baggage Services',
    phone: '+66 2 134 0000',
    email: 'bkk.baggage@flython.example',
    updated_at: UPDATED,
    updated_by: STAFF_ID,
    airport: { name: 'Suvarnabhumi', city: 'Bangkok' },
  }
}

function makeSvc() {
  const db = {
    station_contact: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue(row()),
      upsert: jest.fn().mockResolvedValue(row()),
    },
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))
  const audit = { write: jest.fn().mockResolvedValue({ id: 'a-1', seq: '1' }) }

  return { svc: new StationContactService(db as unknown as DbService, audit as unknown as AuditService), db, audit }
}

const ACTOR: AuditActor = { type: 'staff', id: '99999999-9999-4999-8999-999999999999', role: 'baggage' }

const input = { staffId: STAFF_ID, actor: ACTOR, airportCode: 'bkk', deskName: ' Baggage Services ', phone: '+66 2 134 0000', email: '' }

describe('StationContactService', () => {
  it('writes a change to audit_log with what it was before', async () => {
    const { svc, db, audit } = makeSvc()

    await svc.save(input)

    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        action: 'update',
        entityType: 'station_contact',
        entityId: 'BKK',
        before: expect.objectContaining({ deskName: 'Baggage Services' }),
      }),
      db,
    )
  })

  it('writes a new contact to audit_log as a create', async () => {
    const { svc, db, audit } = makeSvc()
    db.station_contact.findUnique.mockResolvedValueOnce(null)

    await svc.save(input)

    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', before: undefined }), db)
  })

  it('lists contacts with the airport name, by airport code', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.list()).resolves.toEqual([
      expect.objectContaining({ airportCode: 'BKK', airportName: 'Suvarnabhumi', city: 'Bangkok', deskName: 'Baggage Services' }),
    ])
    expect(db.station_contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { airport_code: 'asc' } }))
  })

  it('gets one contact by a case-insensitive airport code', async () => {
    const { svc, db } = makeSvc()

    await svc.get('bkk')

    expect(db.station_contact.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { airport_code: 'BKK' } }))
  })

  it('reports a missing contact, and a bad code without querying', async () => {
    const { svc, db } = makeSvc()
    db.station_contact.findUnique.mockResolvedValue(null)

    await expect(svc.get('NRT')).rejects.toMatchObject({ code: 'STATION_CONTACT_NOT_FOUND', status: 404 })
    await expect(svc.get('Tokyo')).rejects.toMatchObject({ code: 'STATION_CONTACT_NOT_FOUND' })
    expect(db.station_contact.findUnique).toHaveBeenCalledTimes(1)
  })

  it('upserts trimmed values and records who changed them', async () => {
    const { svc, db } = makeSvc()

    await svc.save(input)

    const data = { desk_name: 'Baggage Services', phone: '+66 2 134 0000', email: null, updated_at: expect.any(Date), updated_by: STAFF_ID }
    expect(db.station_contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { airport_code: 'BKK' }, create: { airport_code: 'BKK', ...data }, update: data }),
    )
  })

  it('stores a Thai number in the grouped +66 form', async () => {
    const { svc, db } = makeSvc()

    await svc.save({ ...input, phone: '+6653000001' })

    expect(db.station_contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ phone: '+66 53 000 001' }) }),
    )
  })

  it('refuses a phone without + and the country code', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.save({ ...input, phone: '02 134 0000' })).rejects.toMatchObject({ code: 'INVALID_STATION_CONTACT', status: 400 })
    expect(db.station_contact.upsert).not.toHaveBeenCalled()
  })

  it('rejects a missing desk name or phone', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.save({ ...input, phone: ' ' })).rejects.toMatchObject({ code: 'INVALID_STATION_CONTACT', status: 400 })
    expect(db.station_contact.upsert).not.toHaveBeenCalled()
  })

  it('maps an unknown airport (P2003) to INVALID_STATION_CONTACT', async () => {
    const { svc, db } = makeSvc()
    db.station_contact.upsert.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }))

    await expect(svc.save({ ...input, airportCode: 'ZZZ' })).rejects.toMatchObject({ code: 'INVALID_STATION_CONTACT' })
  })
})
