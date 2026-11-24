import { Injectable, Logger, Optional } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { CustomerServiceService, NotificationService } from '@backend/modules/customer-service'

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

/** The status as the passenger reads it in a message. */
const CASE_STATUS_TEXT: Record<Exclude<BaggageCaseEvent, 'delivering'>, string> = {
  opened_for_found_bag: 'We found a bag tagged to you and opened this case for it',
  matched: 'Your bag has been found and matched to your report',
  closed: 'Closed',
  cancelled: 'Cancelled',
  lost: 'Not found in time. A customer service case has been opened for compensation',
}

/** `in_transit` -> `In transit`. */
function stepText(step: string): string {
  const words = step.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The one place Feature 10 tells Feature 13 about case changes: each notice becomes a `bag_case_updated` or
 * `bag_delivery_updated` message through F13's NotificationService, and a `lost` notice also opens F13's compensation
 * case. Callers send notices only after their transaction has committed, and this never throws: a failed notice must not
 * undo or fail a case change that already happened. Built without F13 (unit tests), it only logs.
 */
@Injectable()
export class BaggageCaseNotices {
  private readonly logger = new Logger(BaggageCaseNotices.name)

  constructor(
    @Optional() private readonly db?: DbService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly customerService?: CustomerServiceService,
  ) {}

  notify(notices: BaggageCaseNotice[]): void {
    for (const notice of notices) {
      try {
        this.logger.debug(`Case ${notice.reportId}: ${notice.event}${notice.detail ? ` (${notice.detail})` : ''}`)
      } catch {
        // Logging must not break the caller.
      }
      void this.send(notice).catch((e) => {
        this.logger.error(`Notice ${notice.event} for case ${notice.reportId} failed`, e instanceof Error ? e.stack : String(e))
      })
    }
  }

  /** Sends one notice to F13. Public for tests, which await it instead of the fire-and-forget `notify`. */
  async send(notice: BaggageCaseNotice): Promise<void> {
    if (!this.db || !this.notifications) return

    if (notice.event === 'lost' && this.customerService) {
      await this.customerService.openLostBagCase(notice.reportId)
    }

    const report = await this.db.lost_bag_report.findUnique({
      where: { id: notice.reportId },
      select: {
        case_number: true,
        contact_email: true,
        contact_phone: true,
        passenger: { select: { first_name: true, last_name: true, customer: { select: { id: true, phone: true } } } },
      },
    })
    if (!report) return

    const passengerName = `${report.passenger.first_name} ${report.passenger.last_name}`.trim()
    const recipients = [
      {
        passengerName,
        email: report.contact_email?.trim() || null,
        phone: report.contact_phone?.trim() || report.passenger.customer?.phone?.trim() || null,
        // The traveller's own account, if they have one, for their preferences and push.
        customerId: report.passenger.customer?.id ?? null,
      },
    ]
    // One message per case and change: a repeated notice is ignored by F13's (source, source_event_id) check.
    const sourceEventId = `${notice.event}:${notice.reportId}${notice.detail ? `:${notice.detail}` : ''}`

    if (notice.event === 'delivering') {
      await this.notifications.handleEvent({
        source: '10',
        sourceEventId,
        eventType: 'bag_delivery_updated',
        payload: { case_number: report.case_number, delivery_status: stepText(notice.detail ?? 'preparing') },
        recipients,
      })
      return
    }

    await this.notifications.handleEvent({
      source: '10',
      sourceEventId,
      eventType: 'bag_case_updated',
      payload: { case_number: report.case_number, status: CASE_STATUS_TEXT[notice.event] },
      recipients,
    })
  }
}
