import { BadGatewayException, Injectable } from '@nestjs/common'

// Iteration-03: dismissing a conflict needs a reason and an entry in Feature 15's audit log. schedule_conflict has no
// column for the reason, so the audit entry is the only record of it. Feature 15 has no API yet, so the pending adapter
// refuses (502, the spec's code for another feature being unreachable) instead of pretending the entry was stored.

export const AUDIT_SINK = Symbol('AUDIT_SINK')

export interface AuditEntry {
  action: 'schedule_conflict.dismissed'
  entityId: string
  actorId: string
  reason: string
  occurredAt: Date
}

export interface AuditSink {
  record(entry: AuditEntry): Promise<void>
}

export const AUDIT_NOT_CONNECTED = 'Feature 15 audit is not connected yet, so the audit entry this action needs cannot be written'

@Injectable()
export class PendingAuditSink implements AuditSink {
  record(): Promise<void> {
    return Promise.reject(new BadGatewayException(AUDIT_NOT_CONNECTED))
  }
}
