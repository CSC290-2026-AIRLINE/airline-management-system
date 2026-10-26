import type { watchlist_entry } from '@backend/db/generated/prisma/client'

// Explicit allow-list: list responses never expose a full passport number.
export function watchlistSummary(entry: watchlist_entry) {
  const passportLast4 = entry.passport_number?.slice(-4) ?? null
  return {
    id: entry.id,
    firstName: entry.first_name,
    lastName: entry.last_name,
    dateOfBirth: entry.date_of_birth?.toISOString().slice(0, 10) ?? null,
    nationality: entry.nationality,
    passportLast4,
    passportMasked: passportLast4 ? `•••• ${passportLast4}` : null,
    listType: entry.list_type,
    status: entry.status,
    issuingAuthority: entry.issuing_authority,
    reason: entry.reason,
    listedAt: entry.listed_at.toISOString(),
    clearedAt: entry.cleared_at?.toISOString() ?? null,
    clearReason: entry.clear_reason,
    updatedAt: entry.updated_at.toISOString(),
  }
}

export function watchlistDetail(entry: watchlist_entry) {
  return { ...watchlistSummary(entry), passportNumber: entry.passport_number }
}
