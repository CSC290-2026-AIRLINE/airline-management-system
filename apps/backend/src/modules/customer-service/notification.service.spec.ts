import { ConflictException, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DbService } from '@backend/db/db.service'
import { SimulationClock as Clock } from '../admin-console/simulation-clock'
import { BOOKING_EVENT_BUS } from '../booking-pnr/contracts'
import type { SimulationClock } from '../admin-console/simulation-clock'
import { SECURITY_AUTHORITY_EMAIL } from './notification-events'
import { NotificationService } from './notification.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const NOW = new Date('2026-11-12T08:00:00Z')
const LATER = new Date('2026-11-12T08:05:00Z')

describe('NotificationService', () => {
  let service: NotificationService
  let db: any
  let clock: { now: jest.Mock }

  beforeEach(() => {
    clock = { now: jest.fn().mockReturnValue(NOW) }
    db = {
      inbound_event: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      notification_type: {
        findUnique: jest.fn(),
      },
      notification_template: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      notification_preference: {
        findMany: jest.fn(),
      },
      notification: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      booking_segment: {
        findMany: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
      },
      booking_passenger: {
        findFirst: jest.fn(),
      },
    }
    // The interactive transaction runs on the same mock client.
    db.$transaction = jest.fn((work: (tx: unknown) => unknown) => work(db))
    service = new NotificationService(db, clock as unknown as SimulationClock)
  })

  describe('Stored events from other features (processStoredEvents)', () => {
    const tierEvent = {
      id: 'ev-11',
      source: '11',
      source_event_id: 'tier_changed:m1:2026-11-01T00:00:00.000Z',
      event_type: 'tier_changed',
      payload: { customer_id: 'cust-1', member_id: 'm1', passenger_name: 'Anna Lee', tier_name: 'Gold', tier_expires_on: '2027-11-01' },
    }

    beforeEach(() => {
      db.inbound_event.findMany = jest.fn().mockResolvedValue([tierEvent])
      db.inbound_event.updateMany = jest.fn().mockResolvedValue({ count: 1 })
      db.customer.findFirst = jest.fn().mockResolvedValue({
        id: 'cust-1',
        phone: null,
        user: { email: 'anna.lee@example.com' },
        passenger: { first_name: 'Anna', last_name: 'Lee' },
      })
      db.notification_type.findUnique.mockResolvedValue({ code: 'tier_changed', is_mandatory: false })
      db.notification_template.findMany.mockResolvedValue([
        {
          channel: 'email',
          is_active: true,
          subject_template: 'Your tier is now {{tier_name}}',
          body_template: 'Dear {{passenger_name}}, your tier is now {{tier_name}}, valid until {{tier_expires_on}}.',
        },
      ])
      db.notification_preference.findMany.mockResolvedValue([])
    })

    it('sends a loyalty event to the customer it names, filling placeholders from its payload', async () => {
      await expect(service.processStoredEvents()).resolves.toBe(1)

      expect(db.inbound_event.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { processed_at: null } }))
      expect(db.inbound_event.updateMany).toHaveBeenCalledWith({ where: { id: 'ev-11', processed_at: null }, data: { processed_at: NOW } })
      expect(db.notification.create).toHaveBeenCalledTimes(1)
      expect(db.notification.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          inbound_event_id: 'ev-11',
          type_code: 'tier_changed',
          channel: 'email',
          recipient: 'anna.lee@example.com',
          customer_id: 'cust-1',
          subject: 'Your tier is now Gold',
          body: 'Dear Anna Lee, your tier is now Gold, valid until 2027-11-01.',
          status: 'sent',
        }),
      )
    })

    it('sends nothing when another tick already claimed the event', async () => {
      db.inbound_event.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.processStoredEvents()).resolves.toBe(0)
      expect(db.notification.create).not.toHaveBeenCalled()
    })

    it('sends a stored security alert to the authority', async () => {
      db.inbound_event.findMany.mockResolvedValue([
        {
          id: 'ev-7',
          source: '7',
          source_event_id: 'security_alert:rev-1',
          event_type: 'security_alert',
          payload: { passenger_name: 'Tom Baker', flight_number: 'FY308', service_date: '2026-10-12', reference: 'chk-1' },
        },
      ])
      db.notification_type.findUnique.mockResolvedValue({ code: 'security_alert', is_mandatory: true })
      await service.processStoredEvents()
      expect(db.customer.findFirst).not.toHaveBeenCalled()
      expect(db.notification.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ recipient: SECURITY_AUTHORITY_EMAIL }))
    })

    it('keeps going after one event fails, leaving it for the next tick', async () => {
      db.inbound_event.findMany.mockResolvedValue([{ ...tierEvent, id: 'ev-bad' }, tierEvent])
      db.inbound_event.updateMany.mockRejectedValueOnce(new Error('lock timeout')).mockResolvedValueOnce({ count: 1 })
      await expect(service.processStoredEvents()).resolves.toBe(1)
    })

    it('stops retrying an event that keeps failing so it cannot fill the batch', async () => {
      db.inbound_event.updateMany.mockRejectedValue(new Error('bad row'))
      for (let i = 0; i < 5; i++) await service.processStoredEvents()

      await service.processStoredEvents()

      expect(db.inbound_event.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { processed_at: null, id: { notIn: ['ev-11'] } } }),
      )
    })

    it('marks an event for a customer that no longer exists as processed without sending', async () => {
      db.customer.findFirst.mockResolvedValue(null)
      await expect(service.processStoredEvents()).resolves.toBe(1)
      expect(db.notification.create).not.toHaveBeenCalled()
    })

    it('a tick swallows errors so the timer keeps running', async () => {
      db.inbound_event.findMany.mockRejectedValue(new Error('db down'))
      await expect(service.tick()).resolves.toBeUndefined()
    })
  })

  describe('Core sender (handleEvent)', () => {
    it('1. saves event in inbound_event and ignores repeated events with same source + source_event_id', async () => {
      // First attempt: new event
      db.inbound_event.findUnique.mockResolvedValueOnce(null)
      db.inbound_event.create.mockResolvedValueOnce({ id: 'ev-1' })
      db.notification_type.findUnique.mockResolvedValueOnce({ code: 'flight_delayed', is_mandatory: true })
      db.notification_template.findMany.mockResolvedValueOnce([])

      const res1 = await service.handleEvent({
        source: '2',
        sourceEventId: 'dup-123',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY308' },
        recipients: [],
      })
      expect(res1.ignored).toBe(false)
      expect(db.inbound_event.create).toHaveBeenCalledWith({
        data: {
          source: '2',
          source_event_id: 'dup-123',
          event_type: 'flight_delayed',
          payload: { flight_number: 'FY308' },
          received_at: NOW,
        },
        select: { id: true },
      })

      // Second attempt: repeated event found in findUnique
      db.inbound_event.findUnique.mockResolvedValueOnce({ id: 'ev-1' })
      const res2 = await service.handleEvent({
        source: '2',
        sourceEventId: 'dup-123',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY308' },
        recipients: [],
      })
      expect(res2.ignored).toBe(true)
      expect(res2.eventId).toBe('ev-1')

      // Also handle P2002 duplicate key race condition
      db.inbound_event.findUnique.mockResolvedValueOnce(null)
      db.inbound_event.create.mockRejectedValueOnce({ code: 'P2002' })
      const res3 = await service.handleEvent({
        source: '2',
        sourceEventId: 'dup-123',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY308' },
        recipients: [],
      })
      expect(res3.ignored).toBe(true)
    })

    it('2. sends at most one message per event, recipient and channel', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-2' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'check_in_completed', is_mandatory: false })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Sub', body_template: 'Body' },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-1' })

      // Duplicate recipient in list
      await service.handleEvent({
        source: '6',
        sourceEventId: 'chk-1',
        eventType: 'check_in_completed',
        payload: {},
        recipients: [
          { passengerName: 'John Doe', email: 'john@example.com', phone: null, customerId: null },
          { passengerName: 'John Doe', email: 'john@example.com', phone: null, customerId: null },
        ],
      })

      expect(db.notification.create).toHaveBeenCalledTimes(1)
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inbound_event_id: 'ev-2',
          channel: 'email',
          recipient: 'john@example.com',
          status: 'sent',
        }),
      })
    })

    it('3. respects notification_preference: with no row, email is on, SMS and push are off', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-3' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'complaint_received', is_mandatory: false })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Case {{case_number}}', body_template: 'Received' },
        { channel: 'sms', is_active: true, subject_template: null, body_template: 'SMS {{case_number}}' },
        { channel: 'push', is_active: true, subject_template: 'Push', body_template: 'Push {{case_number}}' },
      ])
      // No rows in notification_preference
      db.notification_preference.findMany.mockResolvedValue([])
      db.notification.create.mockResolvedValue({ id: 'notif-1' })

      await service.handleEvent({
        source: '13',
        sourceEventId: 'case-evt-1',
        eventType: 'complaint_received',
        payload: { case_number: 'CS-2026-000001' },
        recipients: [
          {
            passengerName: 'Jane Doe',
            email: 'jane@example.com',
            phone: '+66812345678',
            customerId: 'cust-1',
          },
        ],
      })

      // Only email created, no sms and no push
      expect(db.notification.create).toHaveBeenCalledTimes(1)
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          recipient: 'jane@example.com',
        }),
      })
    })

    it('4. types with is_mandatory still go out by email when customer switched every channel off', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-4' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'flight_delayed', is_mandatory: true })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Delay {{flight_number}}', body_template: 'Delayed' },
      ])
      // Customer disabled all channels
      db.notification_preference.findMany.mockResolvedValue([
        { customer_id: 'cust-2', channel: 'email', is_enabled: false },
        { customer_id: 'cust-2', channel: 'sms', is_enabled: false },
        { customer_id: 'cust-2', channel: 'push', is_enabled: false },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-1' })

      await service.handleEvent({
        source: '2',
        sourceEventId: 'del-1',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY308' },
        recipients: [
          {
            passengerName: 'Bob Smith',
            email: 'bob@example.com',
            phone: '+66812345678',
            customerId: 'cust-2',
          },
        ],
      })

      // Must still send email because is_mandatory is true
      expect(db.notification.create).toHaveBeenCalledTimes(1)
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          recipient: 'bob@example.com',
          status: 'sent',
        }),
      })
    })

    it('5. fills {{placeholders}} from event data using names in notification-placeholders.ts', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-5' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'gate_changed', is_mandatory: true })
      db.notification_template.findMany.mockResolvedValue([
        {
          channel: 'email',
          is_active: true,
          subject_template: 'Gate change for {{flight_number}}',
          body_template: 'Dear {{passenger_name}}, gate for {{flight_number}} is now {{gate}}.',
        },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-1' })

      await service.handleEvent({
        source: '6',
        sourceEventId: 'gate-1',
        eventType: 'gate_changed',
        payload: { flight_number: 'FY308', gate: 'B4' },
        recipients: [
          {
            passengerName: 'Alice Green',
            email: 'alice@example.com',
            phone: null,
            customerId: null,
          },
        ],
      })

      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject: 'Gate change for FY308',
          body: 'Dear Alice Green, gate for FY308 is now B4.',
          status: 'sent',
        }),
      })
    })

    it('6. mock provider writes notification row, marks sent, sets attempts=1 and sent_at from simulation clock', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-6' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'boarding_call', is_mandatory: false })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Boarding {{flight_number}}', body_template: 'Boarding now' },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-1' })

      await service.handleEvent({
        source: '6',
        sourceEventId: 'brd-1',
        eventType: 'boarding_call',
        payload: { flight_number: 'FY308' },
        recipients: [{ passengerName: 'Alice', email: 'alice@example.com', phone: null, customerId: null }],
      })

      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'sent',
          attempts: 1,
          sent_at: NOW,
          queued_at: NOW,
          error: null,
        }),
      })
    })

    it('7. skips switched-off template; saves row as failed with error and subject/body as NULL when template missing', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-7' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'flight_delayed', is_mandatory: true })
      // SMS template is switched off (is_active: false); push template is completely missing
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Delayed', body_template: 'Delayed' },
        { channel: 'sms', is_active: false, subject_template: null, body_template: 'Delayed' },
      ])
      // Enable all channels
      db.notification_preference.findMany.mockResolvedValue([
        { customer_id: 'cust-bob', channel: 'email', is_enabled: true },
        { customer_id: 'cust-bob', channel: 'sms', is_enabled: true },
        { customer_id: 'cust-bob', channel: 'push', is_enabled: true },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-1' })

      await service.handleEvent({
        source: '2',
        sourceEventId: 'del-2',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY308' },
        recipients: [
          {
            passengerName: 'Bob',
            email: 'bob@example.com',
            phone: '+66812345678',
            customerId: 'cust-bob',
          },
        ],
      })

      // 1) Email sent
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'sent',
        }),
      })
      // 2) SMS is skipped (is_active: false)
      expect(db.notification.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channel: 'sms' }),
        }),
      )
      // 3) Push missing template: saved as failed, subject=null, body=null, error='TEMPLATE_MISSING'
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'push',
          status: 'failed',
          subject: null,
          body: null,
          error: 'TEMPLATE_MISSING',
          attempts: 1,
        }),
      })
    })

    it('8. skips SMS when no phone; skips push for a recipient without a customer account', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-8' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'flight_delayed', is_mandatory: true })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Email', body_template: 'Email' },
        { channel: 'sms', is_active: true, subject_template: null, body_template: 'SMS' },
        { channel: 'push', is_active: true, subject_template: 'Push', body_template: 'Push' },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-1' })

      // A recipient without a customer account (for example a co-traveller): phone is null, customerId is null
      await service.handleEvent({
        source: '2',
        sourceEventId: 'del-3',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY308' },
        recipients: [
          {
            passengerName: 'Co Traveller',
            email: 'cotraveller@example.com',
            phone: null,
            customerId: null,
          },
        ],
      })

      // Only email was called, SMS and push were skipped
      expect(db.notification.create).toHaveBeenCalledTimes(1)
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          recipient: 'cotraveller@example.com',
        }),
      })
    })

    it('9. sets processed_at on inbound_event after handling', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-9' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'complaint_received', is_mandatory: false })
      db.notification_template.findMany.mockResolvedValue([])

      await service.handleEvent({
        source: '13',
        sourceEventId: 'evt-proc',
        eventType: 'complaint_received',
        payload: {},
        recipients: [{ passengerName: 'Ann', email: 'ann@example.com', phone: null, customerId: null }],
      })

      expect(db.inbound_event.update).toHaveBeenCalledWith({
        where: { id: 'ev-9' },
        data: expect.objectContaining({ processed_at: NOW }),
      })
    })

    it('10. flight with no passengers saves the event with processed_at and sends nothing', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-10' })
      db.inbound_event.update.mockResolvedValue({})

      const res = await service.handleEvent({
        source: '2',
        sourceEventId: 'empty-flight-1',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY999' },
        recipients: [],
      })

      expect(res.ignored).toBe(false)
      expect(res.sentCount).toBe(0)
      expect(db.notification.create).not.toHaveBeenCalled()
      expect(db.inbound_event.update).toHaveBeenCalledWith({
        where: { id: 'ev-10' },
        data: { processed_at: NOW },
      })
    })

    it('11. writes nothing when an insert fails part-way, so the publisher can send the event again', async () => {
      // A fake transaction: writes are staged and only kept when the callback finishes.
      const committed: string[] = []
      db.$transaction.mockImplementation(async (work: (tx: unknown) => unknown) => {
        const staged: string[] = []
        const tx = {
          ...db,
          inbound_event: {
            create: jest.fn(() => {
              staged.push('inbound_event')
              return Promise.resolve({ id: 'ev-rb' })
            }),
            update: jest.fn(() => Promise.resolve(staged.push('processed_at'))),
          },
          notification: { create: jest.fn().mockRejectedValue(new Error('insert failed')) },
        }
        const result = await work(tx)
        committed.push(...staged)
        return result
      })
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.notification_type.findUnique.mockResolvedValue({ code: 'gate_changed', is_mandatory: true })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'S', body_template: 'B' },
      ])
      const event = {
        source: '6',
        sourceEventId: 'gate-rb',
        eventType: 'gate_changed',
        payload: { flight_number: 'FY308' },
        recipients: [{ passengerName: 'Ann', email: 'ann@example.com', phone: null, customerId: null }],
      }

      await expect(service.handleEvent(event)).rejects.toThrow('insert failed')
      expect(committed).toEqual([])
      expect(db.inbound_event.create).not.toHaveBeenCalled()
      expect(db.inbound_event.update).not.toHaveBeenCalled()
    })

    it('12. loads every recipient’s preferences in one query', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-12' })
      db.notification_type.findUnique.mockResolvedValue({ code: 'flight_delayed', is_mandatory: false })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'S', body_template: 'B' },
        { channel: 'sms', is_active: true, subject_template: null, body_template: 'B' },
      ])
      db.notification_preference.findMany.mockResolvedValue([{ customer_id: 'cust-b', channel: 'sms', is_enabled: true }])

      await service.handleEvent({
        source: '2',
        sourceEventId: 'del-12',
        eventType: 'flight_delayed',
        payload: {},
        recipients: [
          { passengerName: 'A', email: 'a@example.com', phone: '+661', customerId: 'cust-a' },
          { passengerName: 'B', email: 'b@example.com', phone: '+662', customerId: 'cust-b' },
          { passengerName: 'C', email: 'c@example.com', phone: '+663', customerId: 'cust-a' },
        ],
      })

      expect(db.notification_preference.findMany).toHaveBeenCalledTimes(1)
      expect(db.notification_preference.findMany).toHaveBeenCalledWith({
        where: { customer_id: { in: ['cust-a', 'cust-b'] }, type_code: 'flight_delayed' },
      })
      // Only B switched SMS on.
      const sent = db.notification.create.mock.calls.map(([arg]: any[]) => `${arg.data.channel}:${arg.data.recipient}`)
      expect(sent).toEqual(['email:a@example.com', 'email:b@example.com', 'sms:+662', 'email:c@example.com'])
    })

    it('13. keeps the name of the first passenger at a shared email, the one whose message is written', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-13' })
      db.notification_type.findUnique.mockResolvedValue({ code: 'flight_delayed', is_mandatory: true })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'S', body_template: 'Dear {{passenger_name}}' },
      ])

      await service.handleEvent({
        source: '2',
        sourceEventId: 'del-13',
        eventType: 'flight_delayed',
        payload: {},
        recipients: [
          { passengerName: 'Ann Lee', email: 'family@example.com', phone: null, customerId: null },
          { passengerName: 'Ben Lee', email: 'family@example.com', phone: null, customerId: null },
          { passengerName: 'Cat Lee', email: 'family@example.com', phone: null, customerId: null },
        ],
      })

      expect(db.notification.create).toHaveBeenCalledTimes(1)
      expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ body: 'Dear Ann Lee' }) })
      expect(db.inbound_event.update).toHaveBeenCalledWith({
        where: { id: 'ev-13' },
        data: expect.objectContaining({ payload: { recipient_names: { 'family@example.com': 'Ann Lee' } } }),
      })
    })

    it('14. sends a mandatory type by email when email is off and SMS is on but there is no phone', async () => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-14' })
      db.notification_type.findUnique.mockResolvedValue({ code: 'flight_cancelled', is_mandatory: true })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'S', body_template: 'B' },
        { channel: 'sms', is_active: true, subject_template: null, body_template: 'B' },
      ])
      db.notification_preference.findMany.mockResolvedValue([
        { customer_id: 'cust-14', channel: 'email', is_enabled: false },
        { customer_id: 'cust-14', channel: 'sms', is_enabled: true },
      ])

      await service.handleEvent({
        source: '2',
        sourceEventId: 'cxl-14',
        eventType: 'flight_cancelled',
        payload: {},
        recipients: [{ passengerName: 'Dan', email: 'dan@example.com', phone: null, customerId: 'cust-14' }],
      })

      expect(db.notification.create).toHaveBeenCalledTimes(1)
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ channel: 'email', recipient: 'dan@example.com' }),
      })
    })
  })

  describe('Retry failed messages', () => {
    it('11a. retries failed message from provider failure: updates status, sent_at, attempts and clears error', async () => {
      db.notification.findUnique.mockResolvedValue({
        id: 'notif-fail-1',
        status: 'failed',
        attempts: 1,
        subject: 'Delayed',
        body: 'Your flight is delayed',
        type_code: 'flight_delayed',
        channel: 'email',
        inbound_event: { payload: {} },
      })
      clock.now.mockReturnValue(LATER)
      db.notification.update.mockResolvedValue({ id: 'notif-fail-1', status: 'sent' })

      await service.retryFailedNotification('notif-fail-1')

      expect(db.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-fail-1' },
        data: {
          attempts: { increment: 1 },
          status: 'sent',
          sent_at: LATER,
          error: null,
        },
      })
    })

    it('11b. retries message that failed from missing template: fills subject and body on retry when template now exists', async () => {
      db.notification.findUnique.mockResolvedValue({
        id: 'notif-fail-2',
        status: 'failed',
        attempts: 1,
        subject: null,
        body: null,
        type_code: 'gate_changed',
        channel: 'push',
        inbound_event: { payload: { flight_number: 'FY308', gate: 'B5' } },
      })
      // Template was created now
      db.notification_template.findUnique.mockResolvedValue({
        is_active: true,
        subject_template: 'Gate {{gate}}',
        body_template: 'Flight {{flight_number}} changed to {{gate}}',
      })
      clock.now.mockReturnValue(LATER)
      db.notification.update.mockResolvedValue({ id: 'notif-fail-2', status: 'sent' })

      await service.retryFailedNotification('notif-fail-2')

      expect(db.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-fail-2' },
        data: {
          attempts: { increment: 1 },
          subject: 'Gate B5',
          body: 'Flight FY308 changed to B5',
          status: 'sent',
          sent_at: LATER,
          error: null,
        },
      })
    })

    it('11c. test flag on mock provider forces send failure', async () => {
      service.setMockFailure(true)
      expect(service.isMockFailure()).toBe(true)

      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-fail' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ code: 'complaint_received', is_mandatory: false })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Sub', body_template: 'Body' },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-mock-fail' })

      await service.handleEvent({
        source: '13',
        sourceEventId: 'case-fail',
        eventType: 'complaint_received',
        payload: {},
        recipients: [{ passengerName: 'Bob', email: 'bob@example.com', phone: null, customerId: null }],
      })

      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'failed',
          error: 'MOCK_PROVIDER_FAILURE',
          sent_at: null,
        }),
      })

      service.setMockFailure(false)
    })

    it('11d. refuses a message that is not failed with 409 NOT_FAILED and changes nothing', async () => {
      db.notification.findUnique.mockResolvedValue({ id: 'notif-sent', status: 'sent', inbound_event: { payload: {} } })

      await expect(service.retryFailedNotification('notif-sent')).rejects.toThrow(new ConflictException('NOT_FAILED'))
      expect(db.notification.update).not.toHaveBeenCalled()
    })

    it('11e. reports TEMPLATE_DISABLED for a switched-off template and TEMPLATE_STILL_MISSING for none', async () => {
      const failed = { id: 'notif-t', status: 'failed', subject: null, body: null, type_code: 'gate_changed', channel: 'sms' }
      db.notification.findUnique.mockResolvedValue({ ...failed, inbound_event: { payload: {} } })

      db.notification_template.findUnique.mockResolvedValueOnce({ is_active: false, subject_template: null, body_template: 'B' })
      await service.retryFailedNotification('notif-t')
      expect(db.notification.update).toHaveBeenLastCalledWith({
        where: { id: 'notif-t' },
        data: { attempts: { increment: 1 }, error: 'TEMPLATE_DISABLED' },
      })

      db.notification_template.findUnique.mockResolvedValueOnce(null)
      await service.retryFailedNotification('notif-t')
      expect(db.notification.update).toHaveBeenLastCalledWith({
        where: { id: 'notif-t' },
        data: { attempts: { increment: 1 }, error: 'TEMPLATE_STILL_MISSING' },
      })
    })
  })

  describe('Events from F6, F7 and F10 (publish)', () => {
    beforeEach(() => {
      db.inbound_event.findUnique.mockResolvedValue(null)
      db.inbound_event.create.mockResolvedValue({ id: 'ev-pub' })
      db.inbound_event.update.mockResolvedValue({})
      db.notification_type.findUnique.mockResolvedValue({ is_mandatory: true })
      db.notification_template.findMany.mockResolvedValue([
        { channel: 'email', is_active: true, subject_template: 'Notice', body_template: 'Body' },
      ])
      db.notification.create.mockResolvedValue({ id: 'notif-pub' })
    })

    it('12a. F6 gate_changed', async () => {
      await service.publish({
        source: '6',
        sourceEventId: 'gate-evt-1',
        eventType: 'gate_changed',
        flightNumber: 'FY308',
        serviceDate: '2026-11-12',
        gate: 'B4',
        passengerName: 'Bob',
        email: 'bob@example.com',
      })

      expect(db.inbound_event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: '6',
            source_event_id: 'gate-evt-1',
            event_type: 'gate_changed',
          }),
        }),
      )
    })

    it('12b. F6 boarding_pass_issued', async () => {
      await service.publish({
        source: '6',
        sourceEventId: 'bp-evt-1',
        eventType: 'boarding_pass_issued',
        flightNumber: 'FY308',
        serviceDate: '2026-11-12',
        seat: '12A',
        boardingTime: '08:30',
        passengerName: 'Bob',
        email: 'bob@example.com',
      })

      expect(db.inbound_event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: '6',
            source_event_id: 'bp-evt-1',
            event_type: 'boarding_pass_issued',
          }),
        }),
      )
    })

    it('12c. F7 security_alert goes to mock authority address', async () => {
      await service.publish({
        source: '7',
        sourceEventId: 'sec-1',
        eventType: 'security_alert',
        passengerName: 'Suspicious Person',
        flightNumber: 'FY308',
        serviceDate: '2026-11-12',
        reference: 'ALERT-001',
      })

      expect(db.inbound_event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: '7',
            source_event_id: 'sec-1',
            event_type: 'security_alert',
          }),
        }),
      )

      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient: SECURITY_AUTHORITY_EMAIL,
          channel: 'email',
          status: 'sent',
        }),
      })
    })

    it('12d. F10 bag_case_updated', async () => {
      await service.publish({
        source: '10',
        sourceEventId: 'bag-1',
        eventType: 'bag_case_updated',
        caseNumber: 'BAG-2026-001',
        status: 'found_at_hub',
        passengerName: 'Bob',
        email: 'bob@example.com',
      })

      expect(db.inbound_event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: '10',
            source_event_id: 'bag-1',
            event_type: 'bag_case_updated',
          }),
        }),
      )
    })
  })

  describe('Retry and recipients (review fixes)', () => {
    it('renders a failed message that has a subject but no body, and keeps the saved subject', async () => {
      db.notification.findUnique.mockResolvedValue({
        id: 'notif-fail-3',
        status: 'failed',
        attempts: 1,
        subject: 'Push token timeout',
        body: null,
        type_code: 'complaint_updated',
        channel: 'push',
        inbound_event: { payload: { case_number: 'CS-2026-000001', status: 'Resolved' } },
      })
      db.notification_template.findUnique.mockResolvedValue({
        is_active: true,
        subject_template: 'Complaint update',
        body_template: 'Case {{case_number}}: {{status}}.',
      })
      clock.now.mockReturnValue(LATER)

      await service.retryFailedNotification('notif-fail-3')

      expect(db.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-fail-3' },
        data: expect.objectContaining({ subject: 'Push token timeout', body: 'Case CS-2026-000001: Resolved.', status: 'sent' }),
      })
    })

    it('restores the passenger name on retry from inbound_event.payload.recipient_names', async () => {
      db.notification.findUnique.mockResolvedValue({
        id: 'notif-fail-flight',
        status: 'failed',
        attempts: 1,
        recipient: 'ann@example.com',
        subject: null,
        body: null,
        type_code: 'flight_delayed',
        channel: 'email',
        inbound_event: {
          payload: {
            flight_number: 'FY308',
            service_date: '2026-11-12',
            recipient_names: {
              'ann@example.com': 'Ann Lee',
            },
          },
        },
      })
      db.notification_template.findUnique.mockResolvedValue({
        is_active: true,
        subject_template: 'Flight {{flight_number}} delayed',
        body_template: 'Dear {{passenger_name}}, your flight {{flight_number}} on {{service_date}} is delayed.',
      })
      clock.now.mockReturnValue(LATER)

      await service.retryFailedNotification('notif-fail-flight')

      expect(db.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-fail-flight' },
        data: expect.objectContaining({
          subject: 'Flight FY308 delayed',
          body: 'Dear Ann Lee, your flight FY308 on 2026-11-12 is delayed.',
          status: 'sent',
        }),
      })
    })

    it('leaves the name empty on retry when the event has no recipient_names, instead of a co-traveller’s name', async () => {
      // An event processed before recipient_names existed, for a booker who travels with a family member.
      db.notification.findUnique.mockResolvedValue({
        id: 'notif-fail-legacy',
        status: 'failed',
        attempts: 1,
        recipient: 'booker@example.com',
        customer_id: null,
        subject: null,
        body: null,
        type_code: 'flight_delayed',
        channel: 'email',
        inbound_event: { payload: { flight_number: 'FY308', service_date: '2026-11-12' } },
      })
      db.booking_passenger.findFirst.mockResolvedValue({ passenger: { first_name: 'Co', last_name: 'Traveller' } })
      db.notification_template.findUnique.mockResolvedValue({
        is_active: true,
        subject_template: 'Flight {{flight_number}} delayed',
        body_template: 'Dear {{passenger_name}}, your flight {{flight_number}} is delayed.',
      })
      clock.now.mockReturnValue(LATER)

      await service.retryFailedNotification('notif-fail-legacy')

      expect(db.booking_passenger.findFirst).not.toHaveBeenCalled()
      expect(db.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-fail-legacy' },
        data: expect.objectContaining({ body: 'Dear , your flight FY308 is delayed.', status: 'sent' }),
      })
    })

    it('also looks at recently cancelled bookings when asked, for flight_cancelled', async () => {
      db.booking_segment.findMany.mockResolvedValue([])

      await service.findPassengersForFlightTemporary('flight-1', { includeRecentlyCancelled: true })
      await service.findPassengersForFlightTemporary('flight-1')

      const where = (n: number) => db.booking_segment.findMany.mock.calls[n][0].where.booking
      expect(where(0).OR).toEqual([{ status: 'confirmed' }, { status: 'cancelled', cancelled_at: { gte: expect.any(Date) } }])
      expect(where(1)).toEqual({ status: 'confirmed' })
    })

    it('gives a co-traveller without an account no customer id, instead of the booker’s', async () => {
      db.booking_segment.findMany.mockResolvedValue([
        {
          booking: {
            customer_id: 'cust-booker',
            customer: { id: 'cust-booker', phone: null },
            contact_email: 'booker@example.com',
            contact_phone: null,
            booking_passenger: [
              { passenger: { id: 'p1', first_name: 'Ann', last_name: 'Lee', customer: { id: 'cust-booker', phone: null } } },
              { passenger: { id: 'p2', first_name: 'Ben', last_name: 'Lee', customer: null } },
              { passenger: { id: 'p3', first_name: 'Cat', last_name: 'Lee', customer: { id: 'cust-cat', phone: '+6600' } } },
            ],
          },
        },
      ])

      const recipients = await service.findPassengersForFlightTemporary('flight-1')

      expect(recipients.map((r) => [r.passengerName, r.customerId])).toEqual([
        ['Ann Lee', 'cust-booker'],
        ['Ben Lee', null],
        ['Cat Lee', 'cust-cat'],
      ])
    })
  })
  describe("Feature 3's booking events (handleBookingEvent)", () => {
    const AT = new Date('2026-11-12T07:00:00Z')
    const event = (overrides: Record<string, unknown> = {}) => ({
      type: 'booking.confirmed' as const,
      bookingId: 'b-1',
      reference: 'PNR123',
      customerId: 'cust-1',
      flightIds: ['f-1', 'f-2'],
      occurredAt: AT,
      ...overrides,
    })
    let handleEvent: jest.SpyInstance

    beforeEach(() => {
      db.flight = { findFirst: jest.fn().mockResolvedValue({ flight_number: 'FY204', service_date: new Date('2026-11-20T00:00:00Z') }) }
      db.booking_service_request = { findFirst: jest.fn().mockResolvedValue({ status: 'accepted' }) }
      handleEvent = jest.spyOn(service, 'handleEvent').mockResolvedValue({ ignored: false })
    })

    it('sends booking_confirmed to the booking customer, named by the first flight', async () => {
      await service.handleBookingEvent(event())

      expect(db.flight.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['f-1', 'f-2'] } } }))
      expect(handleEvent).toHaveBeenCalledWith({
        source: '3',
        sourceEventId: `booking.confirmed:b-1:f-1,f-2:${AT.toISOString()}`,
        eventType: 'booking_confirmed',
        payload: { customer_id: 'cust-1', reference: 'PNR123', flight_number: 'FY204', service_date: '2026-11-20' },
      })
    })

    it('sends nothing for a booking cancelled with its flight, which flight_cancelled already covers', async () => {
      await service.handleBookingEvent(event({ type: 'booking.cancelled', cancelReason: 'flight_cancelled' }))
      expect(handleEvent).not.toHaveBeenCalled()
    })

    it('sends booking_cancelled for a cancellation the customer or staff made', async () => {
      await service.handleBookingEvent(event({ type: 'booking.cancelled', cancelReason: 'customer_cancel' }))
      expect(handleEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'booking_cancelled' }))
    })

    it('adds the latest assistance request status to service_request_updated', async () => {
      await service.handleBookingEvent(event({ type: 'service_request.updated', flightIds: ['f-1'] }))
      expect(handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'service_request_updated', payload: expect.objectContaining({ status: 'Accepted' }) }),
      )
    })

    it('logs a failure instead of throwing back into Feature 3', async () => {
      const error = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined)
      handleEvent.mockRejectedValue(new Error('db down'))

      await expect(service.handleBookingEvent(event())).resolves.toBeUndefined()
      expect(error).toHaveBeenCalled()
    })
  })
  it("subscribes to Feature 3's booking bus from another module at startup", async () => {
    const bus = { subscribe: jest.fn(), publish: jest.fn() }
    @Module({ providers: [{ provide: BOOKING_EVENT_BUS, useValue: bus }], exports: [BOOKING_EVENT_BUS] })
    class FakeBookingModule {}
    @Module({
      providers: [NotificationService, { provide: DbService, useValue: {} }, { provide: Clock, useValue: { now: () => NOW } }],
    })
    class FakeNotificationModule {}

    const app = await Test.createTestingModule({ imports: [FakeBookingModule, FakeNotificationModule] }).compile()
    await app.init()
    expect(bus.subscribe).toHaveBeenCalledTimes(1)
    await app.close()
  })
})
