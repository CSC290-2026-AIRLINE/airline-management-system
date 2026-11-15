import { Injectable } from '@nestjs/common'
import type { Prisma, watchlist_entry } from '@backend/db/generated/prisma/client'

export interface WatchlistActor {
  userId: string
  staffId: string
  role: string
}

// Deliberately omit full identity, passport, DOB and free-text notes from audit snapshots.
function snapshot(entry: watchlist_entry): Prisma.InputJsonObject {
  return {
    id: entry.id,
    status: entry.status,
    listType: entry.list_type,
    nationality: entry.nationality,
    passportLast4: entry.passport_number?.slice(-4) ?? null,
    hasDateOfBirth: entry.date_of_birth !== null,
    firstNameInitial: entry.first_name.slice(0, 1),
    lastNameInitial: entry.last_name.slice(0, 1),
  }
}

@Injectable()
export class WatchlistAuditService {
  async record(
    tx: Prisma.TransactionClient,
    actor: WatchlistActor,
    occurredAt: Date,
    action: 'create' | 'update' | 'status_change' | 'view_sensitive',
    entry?: watchlist_entry,
    before?: watchlist_entry,
    reason?: string,
  ) {
    await tx.audit_log.create({
      data: {
        occurred_at: occurredAt,
        actor_type: 'staff',
        actor_id: actor.userId,
        actor_role: actor.role,
        source_feature: '7',
        action,
        entity_type: 'watchlist_entry',
        entity_id: entry?.id,
        summary: `Watchlist ${action}`,
        reason,
        ...(before ? { before: snapshot(before) } : {}),
        ...(entry ? { after: snapshot(entry) } : {}),
        is_sensitive: true,
      },
    })
  }
}
