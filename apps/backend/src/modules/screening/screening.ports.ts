import { Injectable } from '@nestjs/common'

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

export abstract class ScreeningNotificationPort {
  // Implementations must enqueue transactionally; never perform external delivery inside a retryable transaction.
  abstract confirm(now: Date): { mode: 'mock'; authorityNotifiedAt: Date }
}
@Injectable()
export class MockScreeningNotification extends ScreeningNotificationPort {
  confirm(now: Date) {
    return { mode: 'mock' as const, authorityNotifiedAt: now }
  }
}
