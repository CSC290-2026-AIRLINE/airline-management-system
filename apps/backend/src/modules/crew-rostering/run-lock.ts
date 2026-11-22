import { ConflictException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'

/**
 * Locks a roster run row for the rest of the caller's transaction and refuses if it is published.
 *
 * Every write to a run's crew or pairings takes this lock first: publish, swap, sick call, auto-assign, editing or
 * deleting a pairing, and storing a check. A status read before the transaction is only a hint, because publish may
 * flip the run in between; reading it again under the lock is what keeps a published roster from changing.
 * Take the run lock before any crew lock, the order every writer uses, so two writers never wait on each other.
 */
export async function lockDraftRun(tx: Prisma.TransactionClient, rosterRunId: string, publishedMessage: string): Promise<void> {
  const [run] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM roster_run WHERE id = ${rosterRunId}::uuid FOR UPDATE`
  if (!run) throw new NotFoundException(`Roster run ${rosterRunId} was not found`)
  if (run.status === 'published') throw new ConflictException(publishedMessage)
}
