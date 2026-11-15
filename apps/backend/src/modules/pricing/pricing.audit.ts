import { Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { AuditService } from '../admin-console/audit/audit.service'

/** Feature number written on every audit row G04 creates. */
export const PRICING_AUDIT_FEATURE = '4'

export interface PricingAuditEntry {
  action: 'create' | 'update' | 'delete'
  /** The table or concept touched, e.g. `fare_class`. */
  entityType: string
  entityId: string
  summary: string
  before?: unknown
  after?: unknown
}

/**
 * G04's one way to write an audit row. Services call it with the caller's transaction client, inside the same
 * `$transaction` as the change, so the change and its entry are saved together or not at all.
 * `userId` is the token's `user.id`; `null` records the change as the system's (e.g. a booking releasing a promo).
 */
@Injectable()
export class PricingAudit {
  constructor(private readonly audit: AuditService) {}

  async write(userId: string | null, entry: PricingAuditEntry, tx: Prisma.TransactionClient): Promise<void> {
    const actor = await this.audit.resolveActor(userId)
    await this.audit.write({ actor, sourceFeature: PRICING_AUDIT_FEATURE, ...entry }, tx)
  }
}
