import { BagDeliveryService, OWNERSHIP_CHECK_ENTITY } from './bag-delivery.service'
import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import type { PresentedIdentity } from './common/ownership-check'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const DELIVERY_ID = '33333333-3333-4333-8333-333333333333'
const REPORT_ID = '77777777-7777-4777-8777-777777777777'
const FOUND_BAG_ID = '66666666-6666-4666-8666-666666666666'
const SIM_NOW = new Date('2026-10-30T08:00:00Z')

const IDENTITY: PresentedIdentity = {
  bookingReference: 'H8LD3Q',
  lastName: 'Haddad',
  collector: 'passenger',
  documentType: 'passport',
  documentNumber: 'AB1234567',
}

/** What Prisma returns for a bag_delivery read with DELIVERY_INCLUDE. */
function deliveryRow(data: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    report_id: REPORT_ID,
    delivery_type: 'hotel',
    address: 'Hotel Gracery Shinjuku, Tokyo',
    pickup_airport: null,
    status: 'in_transit',
    delivered_at: null,
    created_at: SIM_NOW,
    updated_at: SIM_NOW,
    lost_bag_report: {
      id: REPORT_ID,
      case_number: 'LB-2026-000120',
      status: 'delivering',
      contact_email: 'lina@example.com',
      contact_phone: null,
      passenger: { first_name: 'Lina', last_name: 'Haddad' },
      booking_coupon: { booking_passenger: { booking: { booking_reference: 'H8LD3Q' } } },
      bag_match: [
        {
          found_bag: {
            id: FOUND_BAG_ID,
            status: 'sent',
            tag_number: '0789204511',
            found_airport: 'BKK',
            bag_location_event: [{ airport_code: 'NRT', action: 'out_for_delivery', to_airport: null }],
          },
        },
      ],
      bag_cost: [{ expense: { amount: '650.00' } }, { expense: { amount: '1200.00' } }],
    },
    ...data,
  }
}

function makeSvc(delivery: Record<string, unknown> = {}) {
  const db = {
    bag_delivery: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest
        .fn()
        .mockImplementation((args: { select?: unknown }) =>
          Promise.resolve(
            args.select
              ? { id: DELIVERY_ID, report_id: REPORT_ID, status: 'in_transit', delivery_type: 'hotel', pickup_airport: null, ...delivery }
              : deliveryRow(),
          ),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bag_match: { findFirst: jest.fn().mockResolvedValue({ found_bag_id: FOUND_BAG_ID }) },
    bag_location_event: {
      findFirst: jest.fn().mockResolvedValue({ airport_code: 'NRT', action: 'out_for_delivery', to_airport: null }),
      create: jest.fn().mockResolvedValue({}),
    },
    found_bag: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    lost_bag_report: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        case_number: 'LB-2026-000120',
        passenger: { last_name: 'Haddad', passport_number: 'AB1234567' },
        booking_coupon: { booking_passenger: { booking: { booking_reference: 'H8LD3Q' } } },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    audit_log: { findMany: jest.fn().mockResolvedValue([]) },
    staff: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))

  const audit = {
    write: jest.fn().mockResolvedValue({ id: 'a', seq: '1' }),
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: USER_ID, role: 'baggage' }),
  }
  const svc = new BagDeliveryService(db as unknown as DbService, audit as unknown as AuditService, { now: () => SIM_NOW })

  return { svc, db, audit }
}

describe('BagDeliveryService', () => {
  describe('list and getById', () => {
    it('puts bags to send first and delivered ones last', async () => {
      const { svc, db } = makeSvc()
      db.bag_delivery.findMany.mockResolvedValue([
        deliveryRow({ id: 'a', status: 'delivered' }),
        deliveryRow({ id: 'b', status: 'waiting_choice', delivery_type: null, address: null }),
        deliveryRow({ id: 'c', status: 'preparing' }),
      ])

      const rows = await svc.list()

      expect(rows.map((r) => r.status)).toEqual(['preparing', 'waiting_choice', 'delivered'])
    })

    it('adds up the costs and reads where the bag is', async () => {
      const { svc } = makeSvc()

      const delivery = await svc.getById(DELIVERY_ID)

      expect(delivery.totalCost).toBe('1850.00')
      expect(delivery.foundBag).toMatchObject({ id: FOUND_BAG_ID, currentAirport: 'NRT', inTransit: false })
      expect(delivery.ownershipChecks).toEqual([])
    })

    it('reads ownership checks back from the audit log with the staff name', async () => {
      const { svc, db } = makeSvc()
      db.audit_log.findMany.mockResolvedValue([
        {
          id: 'log-1',
          occurred_at: SIM_NOW,
          after: {
            passed: false,
            mismatches: ['last_name'],
            collector: 'passenger',
            representativeName: null,
            documentType: 'passport',
            documentLast4: '4567',
            staffId: STAFF_ID,
          },
        },
        { id: 'junk', occurred_at: SIM_NOW, after: { something: 'else' } },
      ])
      db.staff.findMany.mockResolvedValue([{ id: STAFF_ID, first_name: 'Krit', last_name: 'Sukjai' }])

      const delivery = await svc.getById(DELIVERY_ID)

      expect(db.audit_log.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { source_feature: '10', entity_type: OWNERSHIP_CHECK_ENTITY, entity_id: DELIVERY_ID } }),
      )
      expect(delivery.ownershipChecks).toEqual([
        {
          id: 'log-1',
          passed: false,
          mismatches: ['last_name'],
          collector: 'passenger',
          representativeName: null,
          documentType: 'passport',
          documentLast4: '4567',
          staffName: 'Krit Sukjai',
          checkedAt: SIM_NOW,
        },
      ])
    })

    it('answers DELIVERY_NOT_FOUND for an unknown id', async () => {
      const { svc } = makeSvc()

      await expect(svc.getById('nope')).rejects.toMatchObject({ code: 'DELIVERY_NOT_FOUND' })
    })
  })

  describe('recordChoice', () => {
    it('records an airport pickup and moves the delivery to preparing', async () => {
      const { svc, db } = makeSvc({ status: 'waiting_choice', delivery_type: null })

      await svc.recordChoice({
        staffId: STAFF_ID,
        deliveryId: DELIVERY_ID,
        deliveryType: 'airport_pickup',
        pickupAirport: 'nrt',
        address: 'x',
      })

      expect(db.bag_delivery.updateMany).toHaveBeenCalledWith({
        where: { id: DELIVERY_ID, status: { in: ['waiting_choice', 'preparing'] } },
        data: expect.objectContaining({ delivery_type: 'airport_pickup', pickup_airport: 'NRT', address: null, status: 'preparing' }),
      })
    })

    it('needs an address for a delivery to an address', async () => {
      const { svc } = makeSvc({ status: 'waiting_choice' })

      await expect(
        svc.recordChoice({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, deliveryType: 'home', address: '  ' }),
      ).rejects.toMatchObject({
        code: 'INVALID_DELIVERY',
      })
    })

    it('answers ALREADY_SENT once the bag is on its way', async () => {
      const { svc, db } = makeSvc({ status: 'in_transit' })

      await expect(
        svc.recordChoice({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, deliveryType: 'home', address: '1 Main St' }),
      ).rejects.toMatchObject({
        code: 'ALREADY_SENT',
      })
      expect(db.bag_delivery.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('setStatus', () => {
    it('sends an address delivery out from the station holding the bag', async () => {
      const { svc, db } = makeSvc({ status: 'preparing' })
      db.bag_location_event.findFirst.mockResolvedValue({ airport_code: 'NRT', action: 'arrived', to_airport: null })

      await svc.setStatus({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, status: 'in_transit' })

      expect(db.bag_location_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ found_bag_id: FOUND_BAG_ID, airport_code: 'NRT', action: 'out_for_delivery', staff_id: STAFF_ID }),
      })
      expect(db.found_bag.updateMany).toHaveBeenCalledWith({ where: { id: FOUND_BAG_ID, status: 'matched' }, data: expect.anything() })
      expect(db.lost_bag_report.updateMany).toHaveBeenCalledWith({
        where: { id: REPORT_ID, status: 'matched' },
        data: expect.objectContaining({ status: 'delivering' }),
      })
    })

    it('sends a pickup bag to the pickup airport', async () => {
      const { svc, db } = makeSvc({ status: 'preparing', delivery_type: 'airport_pickup', pickup_airport: 'NRT' })
      db.bag_location_event.findFirst.mockResolvedValue({ airport_code: 'BKK', action: 'held', to_airport: null })

      await svc.setStatus({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, status: 'in_transit' })

      expect(db.bag_location_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ airport_code: 'BKK', action: 'sent', to_airport: 'NRT' }),
      })
    })

    it('records the arrival when a pickup bag in transit is set ready', async () => {
      const { svc, db } = makeSvc({ status: 'in_transit', delivery_type: 'airport_pickup', pickup_airport: 'NRT' })
      db.bag_location_event.findFirst.mockResolvedValue({ airport_code: 'BKK', action: 'sent', to_airport: 'NRT' })

      await svc.setStatus({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, status: 'ready_for_pickup' })

      expect(db.bag_location_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ airport_code: 'NRT', action: 'arrived' }),
      })
      expect(db.bag_delivery.updateMany).toHaveBeenCalledWith({
        where: { id: DELIVERY_ID, status: { in: ['preparing', 'in_transit'] } },
        data: expect.objectContaining({ status: 'ready_for_pickup' }),
      })
    })

    it('refuses ready for pickup while the bag is at another airport', async () => {
      const { svc, db } = makeSvc({ status: 'preparing', delivery_type: 'airport_pickup', pickup_airport: 'NRT' })
      db.bag_location_event.findFirst.mockResolvedValue({ airport_code: 'BKK', action: 'held', to_airport: null })

      await expect(svc.setStatus({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, status: 'ready_for_pickup' })).rejects.toMatchObject({
        code: 'INVALID_STATUS',
      })
      expect(db.bag_delivery.updateMany).not.toHaveBeenCalled()
    })

    it('refuses ready for pickup for a delivery to an address', async () => {
      const { svc } = makeSvc({ status: 'preparing' })

      await expect(svc.setStatus({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, status: 'ready_for_pickup' })).rejects.toMatchObject({
        code: 'INVALID_STATUS',
      })
    })

    it('refuses to send a bag still waiting for the passenger', async () => {
      const { svc } = makeSvc({ status: 'waiting_choice', delivery_type: null })

      await expect(svc.setStatus({ staffId: STAFF_ID, deliveryId: DELIVERY_ID, status: 'in_transit' })).rejects.toMatchObject({
        code: 'INVALID_STATUS',
      })
    })
  })

  describe('handOver', () => {
    it('logs a failed check and changes nothing else', async () => {
      const { svc, db, audit } = makeSvc()

      await expect(
        svc.handOver({ staffId: STAFF_ID, userId: USER_ID, deliveryId: DELIVERY_ID, identity: { ...IDENTITY, lastName: 'Becker' } }),
      ).rejects.toMatchObject({ code: 'OWNERSHIP_NOT_VERIFIED' })

      expect(audit.write).toHaveBeenCalledTimes(1)
      expect(audit.write.mock.calls[0]).toHaveLength(1)
      expect(audit.write.mock.calls[0][0]).toMatchObject({
        sourceFeature: '10',
        action: 'create',
        entityType: OWNERSHIP_CHECK_ENTITY,
        entityId: DELIVERY_ID,
        after: { passed: false, mismatches: ['last_name'], documentLast4: '4567', staffId: STAFF_ID },
      })
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('never stores the full document number', async () => {
      const { svc, audit } = makeSvc()

      await svc.handOver({ staffId: STAFF_ID, userId: USER_ID, deliveryId: DELIVERY_ID, identity: IDENTITY })

      expect(JSON.stringify(audit.write.mock.calls)).not.toContain('AB1234567')
    })

    it('hands over a delivered bag and closes the case in one transaction', async () => {
      const { svc, db, audit } = makeSvc()

      await svc.handOver({ staffId: STAFF_ID, userId: USER_ID, deliveryId: DELIVERY_ID, identity: IDENTITY, note: 'Signed by guest' })

      expect(db.bag_delivery.updateMany).toHaveBeenCalledWith({
        where: { id: DELIVERY_ID, status: 'in_transit' },
        data: expect.objectContaining({ status: 'delivered', delivered_at: SIM_NOW }),
      })
      expect(db.bag_location_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          airport_code: 'NRT',
          action: 'delivered',
          note: 'Handed to passenger; passport ending 4567. Signed by guest',
        }),
      })
      expect(db.found_bag.updateMany).toHaveBeenCalledWith({
        where: { id: FOUND_BAG_ID, status: { in: ['matched', 'sent'] } },
        data: expect.objectContaining({ status: 'delivered' }),
      })
      expect(db.lost_bag_report.updateMany).toHaveBeenCalledWith({
        where: { id: REPORT_ID, status: { in: ['matched', 'delivering', 'lost'] } },
        data: expect.objectContaining({ status: 'closed', closed_at: SIM_NOW }),
      })
      // The audit row is written with the transaction client, so it commits with the handover.
      expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ passed: true }) }), db)
    })

    it('hands a pickup bag over only once it is ready for pickup', async () => {
      const { svc } = makeSvc({ status: 'in_transit', delivery_type: 'airport_pickup', pickup_airport: 'NRT' })

      await expect(svc.handOver({ staffId: STAFF_ID, userId: USER_ID, deliveryId: DELIVERY_ID, identity: IDENTITY })).rejects.toMatchObject(
        {
          code: 'INVALID_STATUS',
        },
      )
    })

    it("needs the representative's name", async () => {
      const { svc } = makeSvc()

      await expect(
        svc.handOver({
          staffId: STAFF_ID,
          userId: USER_ID,
          deliveryId: DELIVERY_ID,
          identity: { ...IDENTITY, collector: 'representative' },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_DELIVERY' })
    })

    it('answers INVALID_STATUS when the delivery changed in the meantime', async () => {
      const { svc, db } = makeSvc()
      db.bag_delivery.updateMany.mockResolvedValue({ count: 0 })

      await expect(svc.handOver({ staffId: STAFF_ID, userId: USER_ID, deliveryId: DELIVERY_ID, identity: IDENTITY })).rejects.toMatchObject(
        {
          code: 'INVALID_STATUS',
        },
      )
    })
  })
})
