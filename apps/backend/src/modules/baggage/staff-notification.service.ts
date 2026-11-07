import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { DeliveryType } from './common/bag-delivery.types'
import { OPEN_MATCH_STATUSES } from './common/bag-match.types'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import type { StaffNotification, StaffNotificationFeed } from './common/staff-notification.types'
import { DEFAULT_UNCLAIMED_AFTER_DAYS } from './found-bag-lifecycle.service'

const DAY_MS = 24 * 60 * 60 * 1000

/** Reports, unclaimed bags and lost cases older than this are no longer news. */
export const NOTIFICATION_WINDOW_DAYS = 14

/** How long before a held bag turns unclaimed the desk is warned. */
export const UNCLAIMED_WARNING_DAYS = 7

export const MAX_NOTIFICATIONS = 50

function item(data: Partial<StaffNotification> & Pick<StaffNotification, 'kind' | 'targetId' | 'occurredAt'>): StaffNotification {
  return {
    id: `${data.kind}:${data.targetId}`,
    caseNumber: null,
    foundBagId: null,
    airportCode: null,
    passengerName: null,
    deliveryType: null,
    dueAt: null,
    ...data,
  }
}

/**
 * Notifications for baggage staff, worked out from the Feature 10 tables each time they are read. Feature 13's
 * notification table only sends email, SMS and push to customers, so nothing is stored for staff; the screen remembers
 * which ones were seen.
 */
@Injectable()
export class StaffNotificationService {
  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  async feed(): Promise<StaffNotificationFeed> {
    const now = this.clock.now()
    const since = new Date(now.getTime() - NOTIFICATION_WINDOW_DAYS * DAY_MS)
    const unclaimedAfterDays = await this.unclaimedAfterDays()
    const warnFrom = new Date(now.getTime() - (unclaimedAfterDays - UNCLAIMED_WARNING_DAYS) * DAY_MS)

    const [matches, reports, deliveries, dueBags, unclaimedBags, lostCases] = await Promise.all([
      this.db.bag_match.findMany({
        where: { match_level: 'strong', status: { in: OPEN_MATCH_STATUSES } },
        select: {
          id: true,
          suggested_at: true,
          found_bag_id: true,
          lost_bag_report: { select: { case_number: true } },
          found_bag: { select: { found_airport: true } },
        },
      }),
      this.db.lost_bag_report.findMany({
        where: { status: 'open', reported_by_staff_id: null, reported_at: { gte: since } },
        select: { id: true, case_number: true, reported_at: true, passenger: { select: { first_name: true, last_name: true } } },
      }),
      this.db.bag_delivery.findMany({
        where: { status: 'preparing' },
        select: { report_id: true, delivery_type: true, updated_at: true, lost_bag_report: { select: { case_number: true } } },
      }),
      this.db.found_bag.findMany({
        where: { status: 'held', found_at: { lte: warnFrom }, bag_match: { none: { status: 'confirmed' } } },
        select: { id: true, found_airport: true, found_at: true },
      }),
      this.db.found_bag.findMany({
        where: { status: 'unclaimed', updated_at: { gte: since } },
        select: { id: true, found_airport: true, updated_at: true },
      }),
      this.db.lost_bag_report.findMany({
        where: { status: 'lost', lost_at: { gte: since } },
        select: { id: true, case_number: true, lost_at: true, passenger: { select: { first_name: true, last_name: true } } },
      }),
    ])

    const items: StaffNotification[] = [
      ...matches.map((m) =>
        item({
          kind: 'strong_match',
          targetId: m.id,
          occurredAt: m.suggested_at,
          caseNumber: m.lost_bag_report.case_number,
          foundBagId: m.found_bag_id,
          airportCode: m.found_bag.found_airport,
        }),
      ),
      ...reports.map((r) =>
        item({
          kind: 'new_report',
          targetId: r.id,
          occurredAt: r.reported_at,
          caseNumber: r.case_number,
          passengerName: `${r.passenger.first_name} ${r.passenger.last_name}`,
        }),
      ),
      ...deliveries.map((d) =>
        item({
          kind: 'delivery_to_send',
          targetId: d.report_id,
          occurredAt: d.updated_at,
          caseNumber: d.lost_bag_report.case_number,
          deliveryType: d.delivery_type as DeliveryType | null,
        }),
      ),
      ...dueBags.map((b) => {
        const dueAt = new Date(b.found_at.getTime() + unclaimedAfterDays * DAY_MS)
        return item({
          kind: 'unclaimed_soon',
          targetId: b.id,
          // The warning starts a week before the bag turns unclaimed.
          occurredAt: new Date(dueAt.getTime() - UNCLAIMED_WARNING_DAYS * DAY_MS),
          foundBagId: b.id,
          airportCode: b.found_airport,
          dueAt,
        })
      }),
      ...unclaimedBags.map((b) =>
        item({ kind: 'bag_unclaimed', targetId: b.id, occurredAt: b.updated_at, foundBagId: b.id, airportCode: b.found_airport }),
      ),
      ...lostCases.map((r) =>
        item({
          kind: 'case_lost',
          targetId: r.id,
          occurredAt: r.lost_at ?? now,
          caseNumber: r.case_number,
          passengerName: `${r.passenger.first_name} ${r.passenger.last_name}`,
        }),
      ),
    ]

    items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || a.id.localeCompare(b.id))

    return { generatedAt: now, items: items.slice(0, MAX_NOTIFICATIONS) }
  }

  private async unclaimedAfterDays(): Promise<number> {
    const setting = await this.db.baggage_setting.findUnique({ where: { key: 'unclaimed_after_days' }, select: { value: true } })
    const parsed = Number(setting?.value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_UNCLAIMED_AFTER_DAYS
  }
}
