import { Injectable } from '@nestjs/common'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import type { AuditAction } from '@backend/modules/admin-console/dto/audit-query.dto'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { AuditProvider, ClockProvider } from './providers'

/** The F6 actions and the F15 action they stand for. */
const ACTION_MAP: Record<string, AuditAction> = {
  'check_in.start': 'create',
  'check_in.complete': 'create',
  'travel_document.submit': 'create',
  'checked_bag.weigh': 'create',
  'checked_bag.remove': 'delete',
  'boarding.board': 'status_change',
  view_sensitive: 'view_sensitive',
}

/** An action F15 does not know is an update. */
export const mapAction = (action: string): AuditAction => ACTION_MAP[action] ?? 'update'

/** The one clock of the system: feature 15's simulation clock, shifted with the demo. */
@Injectable()
export class F15Clock implements ClockProvider {
  constructor(private readonly simulation: SimulationClock) {}

  now(): Date {
    return this.simulation.now()
  }
}

/** Writes the audit rows of feature 6 into feature 15's log. */
@Injectable()
export class F15Audit implements AuditProvider {
  constructor(private readonly audit: AuditService) {}

  async record(entry: {
    actorType: 'staff' | 'customer' | 'system'
    actorId: string | null
    action: string
    entityType: string
    entityId: string
    summary: string
    isSensitive?: boolean
    before?: unknown
    after?: unknown
  }): Promise<void> {
    await this.audit.tryWrite({
      actor: { type: entry.actorType, id: entry.actorId, role: null },
      sourceFeature: '6',
      action: mapAction(entry.action),
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: `[${entry.action}] ${entry.summary}`,
      before: entry.before,
      after: entry.after,
      sensitive: entry.isSensitive ?? false,
    })
  }
}
