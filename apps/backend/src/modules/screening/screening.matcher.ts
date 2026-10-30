import { Injectable } from '@nestjs/common'
import type { Prisma, watchlist_entry } from '@backend/db/generated/prisma/client'
import { classify, type Identity } from './screening.rules'

type Candidate = watchlist_entry & { similarity_score: number }

@Injectable()
export class ScreeningMatcher {
  async match(tx: Prisma.TransactionClient, passenger: Identity) {
    // Parameters stay bound by Prisma. Scores and identity snapshots come from the same rows.
    const candidates = await tx.$queryRaw<Candidate[]>`
      SELECT w.*, GREATEST(
        similarity(name_key(${passenger.first_name}, ${passenger.last_name}), name_key(w.first_name, w.last_name)),
        similarity(name_key(${passenger.last_name}, ${passenger.first_name}), name_key(w.first_name, w.last_name))
      ) AS similarity_score
      FROM watchlist_entry w
      WHERE w.status = 'active'
        AND (
          (w.passport_number = ${passenger.passport_number} AND w.nationality = ${passenger.nationality}
            AND w.passport_number IS NOT NULL AND w.nationality IS NOT NULL)
          OR similarity(name_key(${passenger.first_name}, ${passenger.last_name}), name_key(w.first_name, w.last_name)) >= 0.5
          OR similarity(name_key(${passenger.last_name}, ${passenger.first_name}), name_key(w.first_name, w.last_name)) >= 0.5
        )
      ORDER BY w.id
    `
    return candidates
      .map((entry) => ({ entry, similarity: entry.similarity_score, ...classify(passenger, entry, entry.similarity_score) }))
      .filter((match) => match.level !== 'none')
  }
}
