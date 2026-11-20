import type { Prisma } from '@backend/db/generated/prisma/client'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'

/** What one Feature 8 change says in the audit log. The actor, the feature number and the time are filled in here. */
export interface RosteringAuditEntry {
  action: 'create' | 'update' | 'delete' | 'status_change'
  /** `crew`, `crew_certification`, `crew_setting`, `country_legality_rule`, `country_language`, `pairing`, `roster_run`. */
  entityType: string
  entityId: string
  /** One sentence an auditor can read without opening the row. */
  summary: string
  before?: unknown
  after?: unknown
  reason?: string
}

/**
 * Writes one audit row for a Feature 8 change, with the caller's transaction client, so the change and its audit row
 * commit together or not at all. The actor is the signed-in staff member, resolved on the server from the token's user id;
 * the time is the simulation clock's (`AuditService` stamps it).
 */
export async function writeRosteringAudit(
  audit: AuditService,
  actorUserId: string | undefined,
  entry: RosteringAuditEntry,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const actor = await audit.resolveActor(actorUserId)
  await audit.write({ actor, sourceFeature: '8', ...entry }, tx)
}

/**
 * The fields of `after` that differ from `before`, each side keyed the same, for an `update` row that should show what
 * moved and not the whole record. Compared by JSON so dates and arrays compare by value.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const from: Record<string, unknown> = {}
  const to: Record<string, unknown> = {}
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      from[key] = before[key]
      to[key] = after[key]
    }
  }
  return { before: from, after: to }
}
