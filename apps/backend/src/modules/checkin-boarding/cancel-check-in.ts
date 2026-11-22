import type { Actor } from './actor'
import type { AuditProvider, NotifyProvider } from './providers/providers'
import type { CheckInRepository } from './store/checkin-repository'
import type { CheckInRecord } from './store/checkin-store'

/**
 * Cancels a check-in whose flight or booking was cancelled: the row is kept, its tagged bags are offloaded, the
 * customer is told and the cancel is audited. Features 2 and 3 do not call us when they cancel, so the check-in read,
 * the gate scan and the gate close all catch it here, the same way.
 */
export async function cancelCheckIn(
  deps: { store: CheckInRepository; notify: NotifyProvider; audit: AuditProvider },
  actor: Actor,
  record: CheckInRecord,
  input: { flightNumber: string; why: 'the flight was cancelled' | 'the booking was cancelled' },
): Promise<CheckInRecord> {
  const cancelled = await deps.store.cancelCheckIn(record.id)
  for (const bag of await deps.store.listBags(record.id)) {
    if (bag.status === 'tagged') await deps.store.updateBag(bag.id, { status: 'offloaded' })
  }
  await deps.notify.send('check_in_cancelled', { checkInId: record.id, flightNumber: input.flightNumber, reason: input.why })
  await deps.audit.record({
    actorType: actor.staffId ? 'staff' : 'customer',
    actorId: actor.userId,
    action: 'check_in.cancel',
    entityType: 'check_in',
    entityId: record.id,
    summary: input.why,
    isSensitive: false,
  })
  return cancelled
}
