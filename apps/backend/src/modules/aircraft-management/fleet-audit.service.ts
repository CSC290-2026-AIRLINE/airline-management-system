import { Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { AuditService, type AuditActor, type AuditWriteInput } from '@backend/modules/admin-console/audit/audit.service'

/** The Feature 15 source tag of the rows Feature 9 writes. */
export const FLEET_AUDIT_FEATURE = '9'

export interface FleetAuditEntry {
  /** One of Feature 15's fixed actions: `create`, `update`, `delete` or `status_change` for what Feature 9 does. */
  action: AuditWriteInput['action']
  entityType: string
  entityId: string
  summary: string
  before?: unknown
  after?: unknown
}

/**
 * Feature 9's way into Feature 15's audit writer. Every change is audited by the same transaction that makes it, so the
 * change and its entry are saved together or not at all. The actor is the staff member behind the request.
 */
@Injectable()
export class FleetAuditService {
  constructor(private readonly audit: AuditService) {}

  async record(tx: Prisma.TransactionClient, staffId: string, entry: FleetAuditEntry): Promise<void> {
    const actor = await this.staffActor(tx, staffId)
    await this.audit.write({ actor, sourceFeature: FLEET_AUDIT_FEATURE, ...entry }, tx)
  }

  private async staffActor(tx: Prisma.TransactionClient, staffId: string): Promise<AuditActor> {
    const staff = await tx.staff.findUnique({ where: { id: staffId }, select: { user_id: true, role: { select: { code: true } } } })
    if (!staff) {
      throw new Error(`Staff ${staffId} not found for the audit entry`)
    }
    return { type: 'staff', id: staff.user_id, role: staff.role?.code ?? null }
  }
}
