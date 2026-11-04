import { Injectable } from '@nestjs/common'
import { AuditService } from '../../admin-console/audit/audit.service'
import type { Tx } from './flight-event-writer'

// Iteration-03: dismissing a conflict needs a reason and an entry in Feature 15's audit log. schedule_conflict has no
// column for the reason, so the audit entry is the only record of it. It is written on the caller's transaction, so if it
// cannot be written the conflict stays open.

export const AUDIT_SINK = Symbol('AUDIT_SINK')

export interface AuditEntry {
  action: 'schedule_conflict.dismissed'
  entityId: string
  /** staff.id, like flight_event.actor_id; the audit log itself records the user id. */
  actorId: string
  reason: string
  occurredAt: Date
}

export interface AuditSink {
  record(entry: AuditEntry, tx: Tx): Promise<void>
}

/** Feature 15's audit writer. It has no dismiss action, so a dismissal is a status change of the conflict. */
@Injectable()
export class AuditServiceSink implements AuditSink {
  constructor(private readonly audit: AuditService) {}

  async record(entry: AuditEntry, tx: Tx): Promise<void> {
    const staff = await tx.staff.findUniqueOrThrow({
      where: { id: entry.actorId },
      select: { user_id: true, role: { select: { code: true } } },
    })
    await this.audit.write(
      {
        actor: AuditService.staffActor({ id: staff.user_id, roleCode: staff.role.code }),
        sourceFeature: '2',
        action: 'status_change',
        entityType: 'schedule_conflict',
        entityId: entry.entityId,
        summary: 'Dismissed a schedule conflict',
        reason: entry.reason,
        before: { status: 'open' },
        after: { status: 'dismissed' },
        occurredAt: entry.occurredAt,
      },
      tx,
    )
  }
}
