// AuditPort: writes audit_log rows. F15 (Audit) owns the schema; until
// the audit module ships its own write API, F12 writes through Prisma
// directly so every state change is captured. The record call accepts
// the same transaction client Prisma returns from $transaction so the
// audit row is committed atomically with the data change.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import type { Prisma } from '../../../db/generated/prisma/client'

export interface AuditInput {
  actorType: 'staff' | 'customer' | 'system'
  actorId: string | null
  actorRole: string | null
  sourceFeature: 'onboard-products'
  action: string
  entityType: string
  entityId: string | null
  summary: string
  reason?: string | null
  isSensitive?: boolean
}

export interface AuditPort {
  record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void>
}

@Injectable()
export class AuditService implements AuditPort {
  constructor(private readonly db: DbService) {}

  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.db
    await client.audit_log.create({
      data: {
        occurred_at: new Date(),
        actor_type: input.actorType,
        actor_id: input.actorId,
        actor_role: input.actorRole,
        source_feature: input.sourceFeature,
        // The audit_log action column is constrained to a small enum
        // owned by the Auth/Audit team. F12 writes its own
        // entity-qualified action ("purchase_receipt.create",
        // "stock_movement.adjust", ...) which we map onto the closest
        // allowed verb here.
        action: mapAction(input.action),
        entity_type: input.entityType,
        entity_id: input.entityId,
        summary: input.summary,
        reason: input.reason ?? null,
        is_sensitive: input.isSensitive ?? false,
      },
    })
  }
}

// Map an F12 action to the closest audit_log action enum value. The
// entity is already recorded separately in entity_type, so collapsing
// the dotted form onto the verb is safe.
function mapAction(action: string): string {
  const verb = action.split('.').pop() ?? action
  if (verb === 'create' || verb === 'update' || verb === 'delete' || verb === 'view_sensitive') {
    return verb
  }
  if (
    verb === 'refresh' ||
    verb === 'load' ||
    verb === 'close' ||
    verb === 'void' ||
    verb === 'submit' ||
    verb === 'write_off_expired' ||
    verb === 'to_aircraft' ||
    verb === 'adjust'
  ) {
    return 'update'
  }
  return 'update'
}
