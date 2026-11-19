import { Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '../admin-console/simulation-clock'
import { FlightEventBus, type FlightStatusEvent } from '../flight-scheduling/operations/flight-event-bus'
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

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name)
  private mockFailure = false

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Optional() private readonly flightEventBus?: FlightEventBus,
  ) {}

  onModuleInit() {
    if (this.flightEventBus) {
      this.flightEventBus.subscribe(async (event) => {
        await this.handleFlightStatusEvent(event)
      })
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
        const customerId = p.customer?.id ?? (p.id === b.customer?.id ? b.customer_id : (b.customer_id ?? null))
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
   * Core sender:
   * 1. Save each event in inbound_event. Ignore a repeated event (same source + source_event_id).
   * 2. Send at most one message per event, recipient and channel.
   * 3. Respect notification_preference. With no row, email is on and SMS and push are off.
   * 4. Types with is_mandatory still go out by email when the customer has switched every channel off.
   * 5. Fill {{placeholders}} from the event data, using names in notification-placeholders.ts.
   * 6. Mock provider: write the notification row, mark it sent, and set attempts and sent_at from simulation clock.
   * 7. Switched-off template: skip that channel. Missing template: save row as failed with error, subject and body NULL.
   * 8. No phone number: skip SMS and send other channels. No customer account (guests): skip push.
   * 9. Set processed_at on the event.
   */
  async handleEvent(input: InboundEventInput): Promise<{ ignored: boolean; eventId?: string; sentCount?: number }> {
    const now = this.clock.now()

    // 1. Save event in inbound_event. Ignore repeated event (same source + source_event_id).
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

    let savedEvent: { id: string }
    try {
      savedEvent = await this.db.inbound_event.create({
        data: {
          source: input.source,
          source_event_id: input.sourceEventId,
          event_type: input.eventType,
          payload: input.payload,
          received_at: now,
        },
        select: { id: true },
      })
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return { ignored: true }
      }
      throw e
    }

    // Resolve recipients
    let recipients = input.recipients
    if (!recipients) {
      if (input.eventType === 'security_alert' || input.eventType === 'security_alert_withdrawn') {
        recipients = [
          {
            passengerName: input.payload.passenger_name ?? 'Authority',
            email: SECURITY_AUTHORITY_EMAIL,
            phone: null,
            customerId: null,
          },
        ]
      } else if (input.payload?.flight_id) {
        recipients = await this.findPassengersForFlightTemporary(input.payload.flight_id)
      } else {
        recipients = []
      }
    }

    // A flight with no passengers: save the event and send nothing.
    if (recipients.length === 0) {
      await this.db.inbound_event.update({
        where: { id: savedEvent.id },
        data: { processed_at: this.clock.now() },
      })
      return { ignored: false, eventId: savedEvent.id, sentCount: 0 }
    }

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

    const sentKeys = new Set<string>()
    let sentCount = 0

    for (const r of recipients) {
      // 3. Respect notification_preference. With no row: email on, SMS and push off.
      let emailOn = true
      let smsOn = false
      let pushOn = false

      if (r.customerId) {
        const prefs = await this.db.notification_preference.findMany({
          where: { customer_id: r.customerId, type_code: input.eventType },
        })
        const emailPref = prefs.find((p) => p.channel === 'email')
        const smsPref = prefs.find((p) => p.channel === 'sms')
        const pushPref = prefs.find((p) => p.channel === 'push')

        if (emailPref) emailOn = emailPref.is_enabled
        if (smsPref) smsOn = smsPref.is_enabled
        if (pushPref) pushOn = pushPref.is_enabled
      }

      // 4. Types with is_mandatory still go out by email when customer switched every channel off
      if (isMandatory && r.email && !emailOn && !smsOn && !pushOn) {
        emailOn = true
      }

      // Determine channels for this recipient
      const channels: { channel: 'email' | 'sms' | 'push'; recipientAddress: string }[] = []
      if (emailOn && r.email?.trim()) {
        channels.push({ channel: 'email', recipientAddress: r.email.trim() })
      }
      // 8. No phone number: skip SMS and send other channels
      if (smsOn && r.phone?.trim()) {
        channels.push({ channel: 'sms', recipientAddress: r.phone.trim() })
      }
      // 8. No customer account (guests): skip push, since table requires customer_id for push
      if (pushOn && r.customerId) {
        channels.push({ channel: 'push', recipientAddress: r.customerId })
      }

      for (const { channel, recipientAddress } of channels) {
        // 2. Send at most one message per event, recipient and channel
        const dedupeKey = `${savedEvent.id}:${recipientAddress}:${channel}`
        if (sentKeys.has(dedupeKey)) continue
        sentKeys.add(dedupeKey)

        const tpl = templateByChannel.get(channel)

        // 7. Switched-off template: skip that channel
        if (tpl && !tpl.is_active) {
          continue
        }

        // 7. Missing template: save row as failed with an error, and subject and body as NULL
        if (!tpl) {
          await this.db.notification.create({
            data: {
              inbound_event_id: savedEvent.id,
              type_code: input.eventType,
              channel,
              recipient: recipientAddress,
              customer_id: r.customerId ?? null,
              case_id: input.caseId ?? null,
              subject: null,
              body: null,
              status: 'failed',
              attempts: 1,
              error: 'TEMPLATE_MISSING',
              queued_at: now,
              sent_at: null,
            },
          })
          continue
        }

        // 5. Fill {{placeholders}} from event data using names in notification-placeholders.ts
        const placeholderData: Record<string, any> = {
          ...input.payload,
          ...r.extraPlaceholders,
          passenger_name: r.passengerName,
        }

        const subject = renderTemplate(tpl.subject_template, placeholderData)
        const body = renderTemplate(tpl.body_template, placeholderData) ?? ''

        // 6. Mock provider: set attempts and sent_at from simulation clock
        const fail = this.mockFailure
        await this.db.notification.create({
          data: {
            inbound_event_id: savedEvent.id,
            type_code: input.eventType,
            channel,
            recipient: recipientAddress,
            customer_id: r.customerId ?? null,
            case_id: input.caseId ?? null,
            subject,
            body,
            status: fail ? 'failed' : 'sent',
            attempts: 1,
            error: fail ? 'MOCK_PROVIDER_FAILURE' : null,
            queued_at: now,
            sent_at: fail ? null : now,
          },
        })
        sentCount++
      }
    }

    // 9. Set processed_at on the event
    await this.db.inbound_event.update({
      where: { id: savedEvent.id },
      data: { processed_at: this.clock.now() },
    })

    return { ignored: false, eventId: savedEvent.id, sentCount }
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
   */
  async retryFailedNotification(notificationId: string) {
    const notif = await this.db.notification.findUnique({
      where: { id: notificationId },
      include: { inbound_event: true },
    })
    if (!notif) throw new NotFoundException(`Notification ${notificationId} not found`)
    if (notif.status !== 'failed') return notif

    const now = this.clock.now()

    // Case 1: Template was missing (subject and body are null)
    if (notif.subject === null && notif.body === null) {
      const tpl = await this.db.notification_template.findUnique({
        where: {
          type_code_channel: {
            type_code: notif.type_code,
            channel: notif.channel,
          },
        },
      })

      if (!tpl || !tpl.is_active) {
        return this.db.notification.update({
          where: { id: notificationId },
          data: {
            attempts: { increment: 1 },
            error: 'TEMPLATE_STILL_MISSING',
          },
        })
      }

      const payload = (notif.inbound_event.payload as Record<string, any>) ?? {}
      const subject = renderTemplate(tpl.subject_template, payload)
      const body = renderTemplate(tpl.body_template, payload) ?? ''

      if (this.mockFailure) {
        return this.db.notification.update({
          where: { id: notificationId },
          data: {
            attempts: { increment: 1 },
            error: 'MOCK_PROVIDER_FAILURE',
          },
        })
      }

      return this.db.notification.update({
        where: { id: notificationId },
        data: {
          subject,
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
      return this.db.notification.update({
        where: { id: notificationId },
        data: {
          attempts: { increment: 1 },
          error: 'MOCK_PROVIDER_FAILURE',
        },
      })
    }

    return this.db.notification.update({
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
