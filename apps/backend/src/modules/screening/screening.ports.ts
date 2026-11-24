import { Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'

export interface BookingSummary {
  source: 'mock' | 'not_connected'
  pnrId: string | null
  reference: string | null
  bookedBy: string | null
  others: string | null
}
export abstract class ScreeningBookingPort {
  abstract get(pnrId: string | null): Promise<BookingSummary>
}

@Injectable()
export class MockScreeningBooking extends ScreeningBookingPort {
  get(pnrId: string | null): Promise<BookingSummary> {
    // These UUIDs are demo-only. Unknown real bookings are never populated with invented people.
    const fixture: Record<string, Omit<BookingSummary, 'source' | 'pnrId'>> = {
      '70000000-0000-4000-8000-000000000001': { reference: 'ABC123', bookedBy: 'Somsak Jaidee (own account)', others: '1 (checked in)' },
      '70000000-0000-4000-8000-000000000002': { reference: 'QW7T2M', bookedBy: 'Travel desk (staff booking)', others: '2 (checked in)' },
      '70000000-0000-4000-8000-000000000003': { reference: 'K9PL4R', bookedBy: 'Maya Kornsiri (own account)', others: 'None' },
    }
    const booking = pnrId ? fixture[pnrId] : undefined
    return Promise.resolve(
      booking ? { source: 'mock', pnrId, ...booking } : { source: 'not_connected', pnrId, reference: null, bookedBy: null, others: null },
    )
  }
}

/** The confirmed (or withdrawn) match the authority is told about. */
export interface SecurityAlert {
  checkId: string
  revision: number
  flightId: string
  passengerName: string
}

export abstract class ScreeningNotificationPort {
  // Implementations must enqueue transactionally; never perform external delivery inside a retryable transaction.
  abstract confirm(tx: Prisma.TransactionClient, now: Date, alert: SecurityAlert): Promise<{ mode: 'mock'; authorityNotifiedAt: Date }>
  /** A confirmed match later reviewed as a false positive: tell the authority the alert is withdrawn. */
  abstract withdraw(tx: Prisma.TransactionClient, now: Date, alert: SecurityAlert): Promise<void>
}
@Injectable()
export class MockScreeningNotification extends ScreeningNotificationPort {
  confirm(_tx: Prisma.TransactionClient, now: Date) {
    return Promise.resolve({ mode: 'mock' as const, authorityNotifiedAt: now })
  }
  withdraw() {
    return Promise.resolve()
  }
}

/**
 * Queues the alert with Feature 13 by writing its inbound_event row in this review's transaction, so the alert exists
 * exactly when the review commits. Feature 13 picks the row up and emails the authority (its sender is mocked, hence
 * the 'mock' mode). The reference is the screening check id, so the withdrawal names the same alert.
 */
@Injectable()
export class Feature13ScreeningNotification extends ScreeningNotificationPort {
  async confirm(tx: Prisma.TransactionClient, now: Date, alert: SecurityAlert) {
    await this.queue(tx, now, 'security_alert', alert)
    return { mode: 'mock' as const, authorityNotifiedAt: now }
  }

  async withdraw(tx: Prisma.TransactionClient, now: Date, alert: SecurityAlert) {
    await this.queue(tx, now, 'security_alert_withdrawn', alert)
  }

  private async queue(
    tx: Prisma.TransactionClient,
    now: Date,
    eventType: 'security_alert' | 'security_alert_withdrawn',
    alert: SecurityAlert,
  ) {
    const flight = await tx.flight.findUnique({ where: { id: alert.flightId }, select: { flight_number: true, service_date: true } })
    await tx.inbound_event.create({
      data: {
        source: '7',
        source_event_id: `${eventType}:${alert.checkId}:${alert.revision}`,
        event_type: eventType,
        payload: {
          passenger_name: alert.passengerName,
          flight_number: flight?.flight_number ?? '',
          service_date: flight ? flight.service_date.toISOString().slice(0, 10) : '',
          reference: alert.checkId,
        },
        received_at: now,
      },
    })
  }
}
