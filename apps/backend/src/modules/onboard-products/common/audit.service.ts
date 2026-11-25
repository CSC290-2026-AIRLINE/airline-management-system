// AuditPort: F12's entry into Feature 15's audit writer. Every row is written with source_feature '12' and carries a
// reason (the caller's, or the summary when the caller gave none). The record call takes the transaction client so the
// audit row commits atomically with the data change.

import { Injectable } from '@nestjs/common'
import type { Prisma } from '../../../db/generated/prisma/client'
import { AuditService as F15AuditService } from '../../admin-console/audit/audit.service'
import type { AuditAction } from '../../admin-console/dto/audit-query.dto'

export const F12_SOURCE_FEATURE = '12'

export interface AuditInput {
  actorType: 'staff' | 'customer' | 'system'
  actorId: string | null
  actorRole: string | null
  // Ignored: every F12 row is written as source_feature '12'. Kept so existing callers still compile.
  sourceFeature?: string
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
  constructor(private readonly f15: F15AuditService) {}

  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    await this.f15.write(
      {
        actor: { type: input.actorType, id: input.actorId, role: input.actorRole },
        sourceFeature: F12_SOURCE_FEATURE,
        action: mapAction(input.action) as AuditAction,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        reason: input.reason?.trim() || input.summary,
        sensitive: input.isSensitive,
      },
      tx,
    )
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
