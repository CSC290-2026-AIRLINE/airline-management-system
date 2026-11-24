import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { SimulationClock } from '../admin-console/simulation-clock'
import { FlightEventBus, type FlightStatusEvent } from '../flight-scheduling/operations/flight-event-bus'
import { BOOKING_EVENT_BUS, type BookingEvent, type BookingEventBus } from '../booking-pnr/contracts'
import {
  SECURITY_AUTHORITY_EMAIL,
  type EventRecipient,
  type ExternalNotificationEvent,
  type InboundEventInput,
} from './notification-events'

export function renderTemplate(template: string | null, data: Record<string, any>): string | null {
  if (template === null || template === undefined) return null
  return template.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_, key) => {
    const val = data[key]
    return val !== undefined && val !== null ? String(val) : ''
  })
}

/** Formats ISO string into HH:mm or return as is. */
function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return isoStr
  }
}

/** Feature 3's booking events and the notification type each one sends. */
const BOOKING_EVENT_TYPES: Record<BookingEvent['type'], string> = {
  'booking.confirmed': 'booking_confirmed',
  'booking.cancelled': 'booking_cancelled',
  'booking.partner_rebooked': 'booking_partner_rebooked',
  'booking.seat_changed': 'booking_seat_changed',
  'service_request.updated': 'service_request_updated',
}

/** `in_progress` -> `In progress`. */
function statusText(status: string): string {
  const words = status.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** How often (real time) stored events from other features are picked up and sent. */
export const STORED_EVENT_TICK_MS = 15_000

@Injectable()
export class NotificationService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name)
  private mockFailure = false
  private timer: NodeJS.Timeout | null = null
  private ticking = false

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Optional() private readonly flightEventBus?: FlightEventBus,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  onModuleInit() {
    if (this.flightEventBus) {
      this.flightEventBus.subscribe(async (event) => {
        await this.handleFlightStatusEvent(event)
      })
    }
    this.bookingEventBus()?.subscribe((event) => this.handleBookingEvent(event))
  }

  /** Feature 3's booking event bus, from whichever module provides it; none when Feature 3 is not loaded (unit tests). */
  private bookingEventBus(): BookingEventBus | null {
    try {
      return this.moduleRef?.get<BookingEventBus>(BOOKING_EVENT_BUS, { strict: false }) ?? null
    } catch {
      return null
    }
  }

  /**
   * Starts the stored-event sender. Off under NODE_ENV=test (Jest sets it) so tests never touch a database. Read from
   * process.env rather than ConfigService: @nestjs/config is ESM-only under Jest, and every module that imports this one
   * would otherwise need to stub it in its specs.
   */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), STORED_EVENT_TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** One sender step; a tick still running when the next fires is skipped, not queued. Public for tests. */
  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      await this.processStoredEvents()
    } catch (e) {
      this.logger.error('Sending stored events failed', e instanceof Error ? e.stack : String(e))
    } finally {
      this.ticking = false
    }
  }

  setMockFailure(fail: boolean) {
    this.mockFailure = fail
  }

  isMockFailure(): boolean {
    return this.mockFailure
  }

  /**
   * Temporary method querying confirmed bookings on a flight until Feature 3 provides its passenger-list route.
   */
  async findPassengersForFlightTemporary(flightId: string): Promise<EventRecipient[]> {
    const segments = await this.db.booking_segment.findMany({
      where: {
        flight_id: flightId,
        booking: { status: 'confirmed' },
      },
      include: {
        booking: {
          include: {
            customer: {
              select: { id: true, phone: true },
            },
            booking_passenger: {
              include: {
                passenger: {
                  include: {
                    customer: {
                      select: { id: true, phone: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    const recipients: EventRecipient[] = []
    const seen = new Set<string>()

    for (const seg of segments) {
      const b = seg.booking
      for (const bp of b.booking_passenger) {
        const p = bp.passenger
        const name = `${p.first_name} ${p.last_name}`.trim()
        // The traveller's own account, if they have one. The booker's account is not theirs, so a co-traveller without an
        // account gets no push and the default preferences (email to the booking contact).
        const customerId = p.customer?.id ?? null
        const phone = p.customer?.phone ?? b.contact_phone ?? null
        const email = b.contact_email ?? null

        const key = `${name}:${email}:${phone}`
        if (seen.has(key)) continue
        seen.add(key)

        recipients.push({
          passengerName: name,
          email,
          phone,
          customerId,
        })
      }
    }

    return recipients
  }

  private async handleFlightStatusEvent(event: FlightStatusEvent) {
    const typeMapping: Record<string, string> = {
      'flight.delayed': 'flight_delayed',
      'flight.rescheduled': 'flight_rescheduled',
      'flight.diverted': 'flight_diverted',
      'flight.cancelled': 'flight_cancelled',
    }
    const notifType = typeMapping[event.type]
    if (!notifType) return

    const recipients = await this.findPassengersForFlightTemporary(event.flight_id)

    const payload: Record<string, any> = {
      flight_number: event.flight_number,
      service_date: event.service_date,
      new_departure: event.new_dep_at ? formatTime(event.new_dep_at) : event.delay_minutes ? `+${event.delay_minutes} min` : '',
      diverted_to: event.new_destination ?? '',
      flight_id: event.flight_id,
    }

    await this.handleEvent({
      source: '2',
      sourceEventId: event.event_id,
      eventType: notifType,
      payload,
      recipients,
    })
  }

  /**
   * Feature 3's booking events, published after their change has committed. The message goes to the booking's customer
   * (their own contact and preferences). A booking cancelled because its flight was cancelled sends nothing here: every
   * passenger already gets `flight_cancelled` from Feature 2's event. Never throws: Feature 3 awaits its subscribers, and a
   * failed message must not fail a booking change that already happened. Public for tests.
   */
  async handleBookingEvent(event: BookingEvent): Promise<void> {
    const eventType = BOOKING_EVENT_TYPES[event.type]
    if (!eventType) return
    if (event.type === 'booking.cancelled' && event.cancelReason === 'flight_cancelled') return
    try {
      // The first flight of the booking (or the one the event is about) names the trip in the message.
      const flight = event.flightIds.length
        ? await this.db.flight.findFirst({
            where: { id: { in: event.flightIds } },
            orderBy: { scheduled_dep_at: 'asc' },
            select: { flight_number: true, service_date: true },
          })
        : null
      const payload: Record<string, any> = {
        customer_id: event.customerId,
        reference: event.reference,
        flight_number: flight?.flight_number ?? '',
        service_date: flight ? flight.service_date.toISOString().slice(0, 10) : '',
      }
      if (event.type === 'service_request.updated') {
        const request = await this.db.booking_service_request.findFirst({
          where: { booking_id: event.bookingId },
          orderBy: { updated_at: 'desc' },
          select: { status: true },
        })
        payload.status = statusText(request?.status ?? 'requested')
      }
      await this.handleEvent({
        source: '3',
        // The bus carries no event id; the booking, the flights it is about and the time make one per change.
        sourceEventId: `${event.type}:${event.bookingId}:${event.flightIds.join(',')}:${event.occurredAt.toISOString()}`,
        eventType,
        payload,
      })
    } catch (e) {
      this.logger.error(`Booking event ${event.type} for ${event.reference} failed`, e instanceof Error ? e.stack : String(e))
    }
  }

  /**
   * Core sender:
   * 1. Save each event in inbound_event. Ignore a repeated event (same source + source_event_id).
   * 2. Send at most one message per event, recipient and channel.
   * 3. Respect notification_preference. With no row, email is on and SMS and push are off.
   * 4. Types with is_mandatory still go out by email when the customer has switched every channel off.
   * 5. Fill {{placeholders}} from the event data, using names in notification-placeholders.ts.
   * 6. Mock provider: write the notification row, mark it sent, and set attempts and sent_at from simulation clock.
   * 7. Switched-off template: skip that channel. Missing template: save row as failed with error, subject and body NULL.
   * 8. No phone number: skip SMS and send other channels. No customer account (a co-traveller or lost-bag contact): skip push.
   * 9. Set processed_at on the event.
   */
  async handleEvent(input: InboundEventInput): Promise<{ ignored: boolean; eventId?: string; sentCount?: number }> {
    const now = this.clock.now()

    // 1. Ignore a repeated event (same source + source_event_id).
    const existing = await this.db.inbound_event.findUnique({
      where: {
        source_source_event_id: {
          source: input.source,
          source_event_id: input.sourceEventId,
        },
      },
    })
    if (existing) {
      return { ignored: true, eventId: existing.id }
    }

    // Everything that only reads happens before the transaction, so the transaction holds only the writes.
    const recipients = await this.resolveRecipients(input)
    const plan = recipients.length > 0 ? await this.planMessages(input, recipients, now) : { rows: [], recipientNames: {} }

    // The event, its messages and processed_at are written together: a failure part-way leaves no stored event, so the
    // publisher can send it again instead of it being ignored as a duplicate.
    let eventSaved = false
    try {
      return await this.db.$transaction(
        async (tx) => {
          const savedEvent = await tx.inbound_event.create({
            data: {
              source: input.source,
              source_event_id: input.sourceEventId,
              event_type: input.eventType,
              payload: input.payload,
              received_at: now,
            },
            select: { id: true },
          })
          eventSaved = true

          // A flight with no passengers: save the event and send nothing.
          if (recipients.length === 0) {
            await tx.inbound_event.update({
              where: { id: savedEvent.id },
              data: { processed_at: this.clock.now() },
            })
            return { ignored: false, eventId: savedEvent.id, sentCount: 0 }
          }

          let sentCount = 0
          for (const row of plan.rows) {
            await tx.notification.create({ data: { ...row, inbound_event_id: savedEvent.id } })
            // A missing template is saved as failed but is not counted as sent.
            if (row.error !== 'TEMPLATE_MISSING') sentCount++
          }

          // 9. Set processed_at on the event and record recipient names map in payload so retry keeps passenger name
          await tx.inbound_event.update({
            where: { id: savedEvent.id },
            data: {
              payload: {
                ...input.payload,
                recipient_names: plan.recipientNames,
              },
              processed_at: this.clock.now(),
            },
          })

          return { ignored: false, eventId: savedEvent.id, sentCount }
        },
        // A full flight writes a message per passenger and channel, well past Prisma's 5 s default.
        { timeout: 30_000 },
      )
    } catch (e: any) {
      // Another request stored the same event between the check above and this insert.
      if (!eventSaved && e?.code === 'P2002') {
        return { ignored: true }
      }
      throw e
    }
  }

  /**
   * Who an event goes to: the recipients the publisher named; else the authority for a security alert; else every
   * passenger on `payload.flight_id`; else the customer in `payload.customer_id` (how Feature 11 addresses a member).
   */
  private async resolveRecipients(input: InboundEventInput): Promise<EventRecipient[]> {
    if (input.recipients) return input.recipients
    const payload = input.payload ?? {}
    if (input.eventType === 'security_alert' || input.eventType === 'security_alert_withdrawn') {
      return [{ passengerName: payload.passenger_name ?? 'Authority', email: SECURITY_AUTHORITY_EMAIL, phone: null, customerId: null }]
    }
    if (payload.flight_id) return this.findPassengersForFlightTemporary(payload.flight_id)
    if (typeof payload.customer_id === 'string') {
      const customer = await this.db.customer.findFirst({
        where: { id: payload.customer_id, deleted_at: null },
        select: { id: true, phone: true, user: { select: { email: true } }, passenger: { select: { first_name: true, last_name: true } } },
      })
      if (!customer) return []
      const name = customer.passenger ? `${customer.passenger.first_name} ${customer.passenger.last_name}`.trim() : ''
      return [
        {
          passengerName: typeof payload.passenger_name === 'string' && payload.passenger_name ? payload.passenger_name : name,
          email: customer.user?.email ?? null,
          phone: customer.phone ?? null,
          customerId: customer.id,
        },
      ]
    }
    return []
  }

  /**
   * Sends events that other features stored straight into inbound_event, in their own transaction, instead of calling
   * `publish` (Feature 11's loyalty jobs, Feature 7's security alerts). Events from `handleEvent` are stored already
   * processed, so only these are picked up. Returns how many events were sent.
   */
  async processStoredEvents(limit = 50): Promise<number> {
    const pending = await this.db.inbound_event.findMany({
      where: { processed_at: null },
      orderBy: { received_at: 'asc' },
      take: limit,
    })
    let processed = 0
    for (const event of pending) {
      try {
        if (await this.processStoredEvent(event)) processed++
      } catch (e) {
        // One bad event must not hold up the rest; it stays unprocessed and is tried again on the next tick.
        this.logger.error(`Stored event ${event.id} (${event.event_type}) failed`, e instanceof Error ? e.stack : String(e))
      }
    }
    return processed
  }

  private async processStoredEvent(event: {
    id: string
    source: string
    source_event_id: string
    event_type: string
    payload: Prisma.JsonValue
  }): Promise<boolean> {
    const payload = (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {}) as Record<
      string,
      any
    >
    const input: InboundEventInput = { source: event.source, sourceEventId: event.source_event_id, eventType: event.event_type, payload }
    const now = this.clock.now()
    const recipients = await this.resolveRecipients(input)
    const plan = recipients.length > 0 ? await this.planMessages(input, recipients, now) : { rows: [], recipientNames: {} }

    return this.db.$transaction(
      async (tx) => {
        // Claim the event: a second tick or server that reads it at the same time finds it processed and sends nothing.
        const { count } = await tx.inbound_event.updateMany({ where: { id: event.id, processed_at: null }, data: { processed_at: now } })
        if (count === 0) return false
        for (const row of plan.rows) {
          await tx.notification.create({ data: { ...row, inbound_event_id: event.id } })
        }
        if (Object.keys(plan.recipientNames).length > 0) {
          await tx.inbound_event.update({
            where: { id: event.id },
            data: { payload: { ...payload, recipient_names: plan.recipientNames } },
          })
        }
        return true
      },
      { timeout: 30_000 },
    )
  }

  /**
   * Works out every message an event sends (steps 2 to 8), without writing anything. Each row still needs its
   * inbound_event_id. Also returns the name for each address a row goes to, for retries.
   */
  private async planMessages(
    input: InboundEventInput,
    recipients: EventRecipient[],
    now: Date,
  ): Promise<{ rows: Omit<Prisma.notificationUncheckedCreateInput, 'inbound_event_id'>[]; recipientNames: Record<string, string> }> {
    // Load notification_type to inspect is_mandatory flag
    const notifType = await this.db.notification_type.findUnique({
      where: { code: input.eventType },
    })
    const isMandatory = notifType?.is_mandatory ?? false

    // Load active templates for this event type
    const templates = await this.db.notification_template.findMany({
      where: { type_code: input.eventType },
    })
    const templateByChannel = new Map(templates.map((t) => [t.channel, t]))

    // 3. Every recipient's preferences for this type, in one query.
    const customerIds = [...new Set(recipients.map((r) => r.customerId).filter((id): id is string => Boolean(id)))]
    const prefs =
      customerIds.length > 0
        ? await this.db.notification_preference.findMany({
            where: { customer_id: { in: customerIds }, type_code: input.eventType },
          })
        : []
    const prefByCustomerChannel = new Map(prefs.map((p) => [`${p.customer_id}:${p.channel}`, p.is_enabled]))

    const sentKeys = new Set<string>()
    const rows: Omit<Prisma.notificationUncheckedCreateInput, 'inbound_event_id'>[] = []
    const recipientNames: Record<string, string> = { ...((input.payload?.recipient_names as Record<string, string>) || {}) }

    for (const r of recipients) {
      // 3. Respect notification_preference. With no row: email on, SMS and push off.
      const pref = (channel: string, fallback: boolean) =>
        r.customerId ? (prefByCustomerChannel.get(`${r.customerId}:${channel}`) ?? fallback) : fallback
      const emailOn = pref('email', true)
      const smsOn = pref('sms', false)
      const pushOn = pref('push', false)

      // Determine channels for this recipient
      const channels: { channel: 'email' | 'sms' | 'push'; recipientAddress: string }[] = []
      if (emailOn && r.email?.trim()) {
        channels.push({ channel: 'email', recipientAddress: r.email.trim() })
      }
      // 8. No phone number: skip SMS and send other channels
      if (smsOn && r.phone?.trim()) {
        channels.push({ channel: 'sms', recipientAddress: r.phone.trim() })
      }
      // 8. No customer account (a co-traveller or lost-bag contact): skip push, since table requires customer_id for push
      if (pushOn && r.customerId) {
        channels.push({ channel: 'push', recipientAddress: r.customerId })
      }
      // 4. A mandatory type always reaches the recipient: when their settings leave no channel (every channel off, or
      // only SMS on with no phone), it goes by email.
      if (isMandatory && channels.length === 0 && r.email?.trim()) {
        channels.push({ channel: 'email', recipientAddress: r.email.trim() })
      }

      for (const { channel, recipientAddress } of channels) {
        // 2. Send at most one message per event, recipient and channel
        const dedupeKey = `${recipientAddress}:${channel}`
        if (sentKeys.has(dedupeKey)) continue
        sentKeys.add(dedupeKey)
        // The first recipient at an address owns its row, so a retry uses their name, not a later co-traveller's.
        if (r.passengerName) recipientNames[recipientAddress] = r.passengerName

        const tpl = templateByChannel.get(channel)

        // 7. Switched-off template: skip that channel
        if (tpl && !tpl.is_active) {
          continue
        }

        const base = {
          type_code: input.eventType,
          channel,
          recipient: recipientAddress,
          customer_id: r.customerId ?? null,
          case_id: input.caseId ?? null,
          attempts: 1,
          queued_at: now,
        }

        // 7. Missing template: save row as failed with an error, and subject and body as NULL
        if (!tpl) {
          rows.push({ ...base, subject: null, body: null, status: 'failed', error: 'TEMPLATE_MISSING', sent_at: null })
          continue
        }

        // 5. Fill {{placeholders}} from event data using names in notification-placeholders.ts
        const placeholderData: Record<string, any> = {
          ...input.payload,
          ...r.extraPlaceholders,
          passenger_name: r.passengerName,
        }

        // 6. Mock provider: set attempts and sent_at from simulation clock. A failure is a saved failed row, not a throw.
        const fail = this.mockFailure
        rows.push({
          ...base,
          subject: renderTemplate(tpl.subject_template, placeholderData),
          body: renderTemplate(tpl.body_template, placeholderData) ?? '',
          status: fail ? 'failed' : 'sent',
          error: fail ? 'MOCK_PROVIDER_FAILURE' : null,
          sent_at: fail ? null : now,
        })
      }
    }

    return { rows, recipientNames }
  }

  /**
   * Public interface for external features (F6, F7, F10) to publish events to F13.
   */
  async publish(event: ExternalNotificationEvent): Promise<{ ignored: boolean; eventId?: string }> {
    switch (event.eventType) {
      case 'gate_changed':
        return this.handleEvent({
          source: event.source,
          sourceEventId: event.sourceEventId,
          eventType: event.eventType,
          payload: {
            flight_number: event.flightNumber,
            service_date: event.serviceDate,
            gate: event.gate,
            flight_id: event.flightId,
          },
          recipients: event.passengerName
            ? [{ passengerName: event.passengerName, email: event.email, phone: event.phone, customerId: event.customerId }]
            : undefined,
        })

      case 'boarding_call':
        return this.handleEvent({
          source: event.source,
          sourceEventId: event.sourceEventId,
          eventType: event.eventType,
          payload: {
            flight_number: event.flightNumber,
            gate: event.gate,
            flight_id: event.flightId,
          },
          recipients: event.passengerName
            ? [{ passengerName: event.passengerName, email: event.email, phone: event.phone, customerId: event.customerId }]
            : undefined,
        })

      case 'check_in_completed':
        return this.handleEvent({
          source: event.source,
          sourceEventId: event.sourceEventId,
          eventType: event.eventType,
          payload: {
            flight_number: event.flightNumber,
            service_date: event.serviceDate,
          },
          recipients: [
            {
              passengerName: event.passengerName,
              email: event.email,
              phone: event.phone,
              customerId: event.customerId,
            },
          ],
        })

      case 'boarding_pass_issued':
        return this.handleEvent({
          source: event.source,
          sourceEventId: event.sourceEventId,
          eventType: event.eventType,
          payload: {
            flight_number: event.flightNumber,
            service_date: event.serviceDate,
            seat: event.seat,
            boarding_time: event.boardingTime,
          },
          recipients: [
            {
              passengerName: event.passengerName,
              email: event.email,
              phone: event.phone,
              customerId: event.customerId,
              extraPlaceholders: { seat: event.seat, boarding_time: event.boardingTime },
            },
          ],
        })

      case 'security_alert':
      case 'security_alert_withdrawn':
        return this.handleEvent({
          source: event.source,
          sourceEventId: event.sourceEventId,
          eventType: event.eventType,
          payload: {
            passenger_name: event.passengerName,
            flight_number: event.flightNumber,
            service_date: event.serviceDate,
            reference: event.reference,
          },
          recipients: [
            {
              passengerName: event.passengerName,
              email: SECURITY_AUTHORITY_EMAIL,
              phone: null,
              customerId: null,
            },
          ],
        })

      case 'bag_case_updated':
        return this.handleEvent({
          source: event.source,
          sourceEventId: event.sourceEventId,
          eventType: event.eventType,
          payload: {
            case_number: event.caseNumber,
            status: event.status,
          },
          recipients: [
            {
              passengerName: event.passengerName,
              email: event.email,
              phone: event.phone,
              customerId: event.customerId,
            },
          ],
        })

      case 'bag_delivery_updated':
        return this.handleEvent({
          source: event.source,
          sourceEventId: event.sourceEventId,
          eventType: event.eventType,
          payload: {
            case_number: event.caseNumber,
            delivery_status: event.deliveryStatus,
          },
          recipients: [
            {
              passengerName: event.passengerName,
              email: event.email,
              phone: event.phone,
              customerId: event.customerId,
            },
          ],
        })
    }
  }

  /**
   * Retry failed messages:
   * - Increase attempts and update status, sent_at and error.
   * - A row that failed because its template was missing (subject & body NULL):
   *   Once template exists, fill them in on retry in same update that marks row sent.
   * - A message that is not failed is a 409 NOT_FAILED, so nothing is changed or audited.
   * Pass `db` to run it inside the caller's transaction, so its audit entry commits with it.
   */
  async retryFailedNotification(notificationId: string, db: Prisma.TransactionClient = this.db) {
    const notif = await db.notification.findUnique({
      where: { id: notificationId },
      include: { inbound_event: true },
    })
    if (!notif) throw new NotFoundException(`Notification ${notificationId} not found`)
    if (notif.status !== 'failed') throw new ConflictException('NOT_FAILED')

    const now = this.clock.now()

    // Case 1: Nothing was rendered (no active template), so the body is null. An SMS has no subject either.
    if (notif.body === null) {
      const tpl = await db.notification_template.findUnique({
        where: {
          type_code_channel: {
            type_code: notif.type_code,
            channel: notif.channel,
          },
        },
      })

      // Still unsendable: the row stays failed and says why, so staff know whether to add or switch on the template.
      if (!tpl || !tpl.is_active) {
        return db.notification.update({
          where: { id: notificationId },
          data: {
            attempts: { increment: 1 },
            error: tpl ? 'TEMPLATE_DISABLED' : 'TEMPLATE_STILL_MISSING',
          },
        })
      }

      // The name comes from the event's own recipient map, or from the recipient's account. Without either it stays empty:
      // looking it up by contact address would pick up any passenger on any booking made with that address.
      const payload = (notif.inbound_event.payload as Record<string, any>) ?? {}
      const recipientNames = (payload.recipient_names as Record<string, string>) ?? {}
      let passengerName = recipientNames[notif.recipient] ?? payload.passenger_name

      if (!passengerName && notif.customer_id && db.customer) {
        const cust = await db.customer.findUnique({
          where: { id: notif.customer_id },
          include: { passenger: true },
        })
        if (cust?.passenger) {
          passengerName = `${cust.passenger.first_name} ${cust.passenger.last_name}`.trim()
        }
      }

      const placeholderData = {
        ...payload,
        ...(passengerName ? { passenger_name: passengerName } : {}),
      }
      const subject = renderTemplate(tpl.subject_template, placeholderData)
      const body = renderTemplate(tpl.body_template, placeholderData) ?? ''

      if (this.mockFailure) {
        return db.notification.update({
          where: { id: notificationId },
          data: {
            attempts: { increment: 1 },
            error: 'MOCK_PROVIDER_FAILURE',
          },
        })
      }

      return db.notification.update({
        where: { id: notificationId },
        data: {
          // A subject that was already saved cannot change (notification_content_fixed trigger), so keep it.
          subject: notif.subject ?? subject,
          body,
          status: 'sent',
          sent_at: now,
          attempts: { increment: 1 },
          error: null,
        },
      })
    }

    // Case 2: Body exists, failed due to provider error
    if (this.mockFailure) {
      return db.notification.update({
        where: { id: notificationId },
        data: {
          attempts: { increment: 1 },
          error: 'MOCK_PROVIDER_FAILURE',
        },
      })
    }

    return db.notification.update({
      where: { id: notificationId },
      data: {
        status: 'sent',
        sent_at: now,
        attempts: { increment: 1 },
        error: null,
      },
    })
  }
}
