import { Inject, Injectable, Logger } from '@nestjs/common'
// Value imports on purpose: `import type` is erased and Nest would see `Function` instead of the class to inject.
import { DbService } from '@backend/db/db.service'
import { NotificationService } from '@backend/modules/customer-service'
import { computeWindow } from '../domain/window'
import { toIsoDate } from '../store/prisma-mappers'
import { SETTINGS } from './providers'
import type { NotifyProvider, SettingsProvider } from './providers'

type NotifyEvent = Parameters<NotifyProvider['send']>[0]

/** F13 templates print times as HH:mm in UTC, the same as its own flight-delay messages. */
const toUtcTime = (value: Date): string => value.toISOString().slice(11, 16)

/** The payload is untyped: an id or a gate code is a string, anything else is treated as missing. */
const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/**
 * Sends the passenger messages of feature 6 through feature 13's notification service. F13 picks the template, the
 * channels and the passenger's preferences; this only finds the passenger, the flight and the contact. A failed
 * message never fails the check-in or the gate change that caused it: errors are logged and swallowed here.
 */
@Injectable()
export class F13Notify implements NotifyProvider {
  private readonly logger = new Logger(F13Notify.name)

  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationService,
    @Inject(SETTINGS) private readonly settings: SettingsProvider,
  ) {}

  async send(event: NotifyEvent, payload: Record<string, unknown>): Promise<void> {
    try {
      switch (event) {
        case 'check_in_completed':
        case 'boarding_pass_issued':
          return await this.sendCheckIn(event, textOf(payload.checkInId) ?? '')
        case 'gate_changed':
          return await this.sendGateChanged(textOf(payload.flightId) ?? '', textOf(payload.from), textOf(payload.to) ?? '')
        case 'boarding_call':
          // F6 sends this when the gate closes, but F13's template says the flight "is now boarding at gate X": wrong
          // at that moment, so it is not forwarded until F6 has a real boarding-started event.
          this.logger.debug(`notify ${event} not forwarded to F13 for flight ${textOf(payload.flightId)}`)
          return
        case 'check_in_cancelled':
          // F13 has no event type or template for a cancelled check-in.
          this.logger.debug(`notify ${event} not forwarded to F13 for check-in ${textOf(payload.checkInId)}`)
          return
      }
    } catch (error) {
      const id = textOf(payload.checkInId) ?? textOf(payload.flightId) ?? 'unknown'
      this.logger.warn(`notify ${event} for ${id} failed: ${error instanceof Error ? error.name : 'unknown error'}`)
    }
  }

  private async sendCheckIn(event: 'check_in_completed' | 'boarding_pass_issued', checkInId: string): Promise<void> {
    const row = await this.db.check_in.findUnique({
      where: { id: checkInId },
      select: {
        passenger_id: true,
        passenger: { select: { first_name: true, last_name: true } },
        flight: { select: { flight_number: true, service_date: true, dep_at: true } },
        boarding_pass: { select: { seat_code: true } },
        booking_coupon: {
          select: {
            booking_passenger: {
              select: {
                booking: {
                  select: {
                    customer_id: true,
                    contact_email: true,
                    contact_phone: true,
                    customer: { select: { passenger_id: true, phone: true, deleted_at: true, user: { select: { email: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!row) {
      this.logger.debug(`notify ${event} skipped: check-in ${checkInId} not found`)
      return
    }

    const booking = row.booking_coupon.booking_passenger.booking
    const customer = booking.customer.deleted_at ? null : booking.customer
    const common = {
      source: '6' as const,
      sourceEventId: `${event}:${checkInId}`,
      flightNumber: row.flight.flight_number,
      serviceDate: toIsoDate(row.flight.service_date),
      passengerName: `${row.passenger.first_name} ${row.passenger.last_name}`,
      email: booking.contact_email || customer?.user.email || null,
      phone: booking.contact_phone ?? customer?.phone ?? null,
      // The booker's account only gets the in-app copy when the booker is the passenger travelling.
      customerId: customer && customer.passenger_id === row.passenger_id ? booking.customer_id : null,
    }

    if (event === 'check_in_completed') {
      await this.notifications.publish({ ...common, eventType: event })
      return
    }
    if (!row.boarding_pass) {
      this.logger.debug(`notify ${event} skipped: check-in ${checkInId} has no boarding pass`)
      return
    }
    // The same boarding time the pass shows: the current departure less the boarding lead from the settings.
    const { boardingAt } = computeWindow(row.flight.dep_at, await this.settings.window())
    await this.notifications.publish({
      ...common,
      eventType: event,
      seat: row.boarding_pass.seat_code,
      boardingTime: toUtcTime(boardingAt),
    })
  }

  /** No passenger fields: F13 fans the message out to every passenger on the flight. */
  private async sendGateChanged(flightId: string, from: string | null, to: string): Promise<void> {
    const flight = await this.db.flight.findUnique({ where: { id: flightId }, select: { flight_number: true, service_date: true } })
    if (!flight) {
      this.logger.debug(`notify gate_changed skipped: flight ${flightId} not found`)
      return
    }
    await this.notifications.publish({
      source: '6',
      // A retry of the same move is deduplicated; a later move to another gate is a new message.
      sourceEventId: `gate_changed:${flightId}:${from ?? 'none'}:${to}`,
      eventType: 'gate_changed',
      flightId,
      flightNumber: flight.flight_number,
      serviceDate: toIsoDate(flight.service_date),
      gate: to,
    })
  }
}
