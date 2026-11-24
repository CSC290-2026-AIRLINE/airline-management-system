import { Injectable, Logger } from '@nestjs/common'

/**
 * What happened to a lost bag case, for Feature 13 (Customer Service, Complaints & Notifications):
 * - opened_for_found_bag: staff opened a case for the owner of a found bag, so the owner should be told.
 * - matched, delivering, closed, cancelled: status changes the passenger is told about. `detail` on delivering is the
 *   delivery step (in_transit, ready_for_pickup, ...).
 * - lost: not found in time; F13 also opens the compensation case.
 */
export type BaggageCaseEvent = 'opened_for_found_bag' | 'matched' | 'delivering' | 'closed' | 'cancelled' | 'lost'

export interface BaggageCaseNotice {
  event: BaggageCaseEvent
  reportId: string
  detail?: string
}

/**
 * The one place Feature 10 tells Feature 13 about case changes. F13 is not wired yet, so this only logs; wire F13's
 * exported service in here and nowhere else. Callers send notices only after their transaction has committed, and this
 * never throws: a failed notice must not undo or fail a case change that already happened.
 */
@Injectable()
export class BaggageCaseNotices {
  private readonly logger = new Logger(BaggageCaseNotices.name)

  notify(notices: BaggageCaseNotice[]): void {
    for (const notice of notices) {
      try {
        this.logger.debug(`Case ${notice.reportId}: ${notice.event}${notice.detail ? ` (${notice.detail})` : ''}`)
      } catch {
        // Logging must not break the caller.
      }
    }
  }
}
