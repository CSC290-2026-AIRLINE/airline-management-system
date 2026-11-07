import type { Prisma } from '@backend/db/generated/prisma/client'
import type { ReportStatus } from './baggage.constants'

/**
 * Cases in recovery: a bag is confirmed and on its way back. While a case is in one of these, its bag moves only through
 * the delivery steps, which keep the delivery, the case and the bag in step.
 */
export const RECOVERY_CASE_STATUSES: readonly ReportStatus[] = ['matched', 'delivering', 'lost']

export interface LockedReport {
  id: string
  status: string
  case_number: string
}

export interface LockedBag {
  id: string
  status: string
}

/**
 * Row locks for writes to a lost bag case and its bag. A transaction that needs both always takes them in this order:
 * the lost_bag_report row first, then the found_bag row. Staff and passenger writes to a case (choice, sending, handover,
 * moves, confirming a match, cancelling) lock the report the same way, so two writers wait on each other in turn instead
 * of acting on a status the other has just changed, and never wait in a cycle.
 *
 * Call inside `db.$transaction`; the lock is held until the transaction ends. Returns null when the row does not exist.
 */
export async function lockLostReport(tx: Prisma.TransactionClient, reportId: string): Promise<LockedReport | null> {
  const rows = await tx.$queryRaw<LockedReport[]>`
    SELECT id, status, case_number FROM lost_bag_report WHERE id = ${reportId}::uuid FOR UPDATE`

  return rows[0] ?? null
}

/** The second lock: take it after lockLostReport when the bag belongs to a case. */
export async function lockFoundBag(tx: Prisma.TransactionClient, foundBagId: string): Promise<LockedBag | null> {
  const rows = await tx.$queryRaw<LockedBag[]>`SELECT id, status FROM found_bag WHERE id = ${foundBagId}::uuid FOR UPDATE`

  return rows[0] ?? null
}
