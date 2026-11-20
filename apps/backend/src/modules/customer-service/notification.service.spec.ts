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
    }
    service = new NotificationService(db, clock as unknown as SimulationClock)
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
        { channel: 'email', is_enabled: false },
        { channel: 'sms', is_enabled: false },
        { channel: 'push', is_enabled: false },
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
        { channel: 'email', is_enabled: true },
        { channel: 'sms', is_enabled: true },
        { channel: 'push', is_enabled: true },
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

    it('8. skips SMS when no phone; skips push when no customer account (guest)', async () => {
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

      // Guest: phone is null, customerId is null
      await service.handleEvent({
        source: '2',
        sourceEventId: 'del-3',
        eventType: 'flight_delayed',
        payload: { flight_number: 'FY308' },
        recipients: [
          {
            passengerName: 'Guest Pax',
            email: 'guest@example.com',
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
          recipient: 'guest@example.com',
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
        data: { processed_at: NOW },
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
})
