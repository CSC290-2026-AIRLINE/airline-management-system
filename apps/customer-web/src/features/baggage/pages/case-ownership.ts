/**
 * Whether the signed-in viewer owns the bag on a case they opened (Stage 3 lets travellers on the same booking view a
 * case). Derived from two server responses for the same verified booking details: the case's bookingPassengerId and the
 * viewer's own entry (isYou) in GET /api/customer/lost-report-travellers.
 *
 * This only decides which controls to show. The backend still refuses owner-only actions (delivery choice, cancel).
 *
 * Returns true (owner), false (another traveller on the booking) or null (unknown, e.g. the traveller list failed).
 */
export function viewerOwnsBag(reportBookingPassengerId: string | null | undefined, travellers: unknown): boolean | null {
  if (!reportBookingPassengerId || !Array.isArray(travellers)) return null

  const you = travellers.find(
    (item): item is { bookingPassengerId: string; isYou: true } =>
      typeof item === 'object' && item !== null && (item as { isYou?: unknown }).isYou === true,
  )
  if (!you || typeof you.bookingPassengerId !== 'string') return null

  return you.bookingPassengerId === reportBookingPassengerId
}

export interface OwnershipResponse {
  ok: boolean
  json(): Promise<unknown>
}

/** stale: the case changed while waiting, so the caller must not touch the current case's ownership state. */
export type OwnershipResult = { stale: true } | { stale: false; ownership: boolean | null }

/**
 * Loads ownership for one case. `isCurrent` is checked after every await (the request and the JSON body), so a slow
 * response for an earlier case can never be applied to a later one. Every non-stale failure resolves to null (fail closed).
 */
export async function resolveViewerOwnership(
  requestTravellers: () => Promise<OwnershipResponse>,
  reportBookingPassengerId: string | null | undefined,
  isCurrent: () => boolean,
): Promise<OwnershipResult> {
  try {
    const response = await requestTravellers()
    if (!isCurrent()) return { stale: true }
    if (!response.ok) return { stale: false, ownership: null }

    const body = await response.json()
    if (!isCurrent()) return { stale: true }

    return { stale: false, ownership: viewerOwnsBag(reportBookingPassengerId, body) }
  } catch {
    return isCurrent() ? { stale: false, ownership: null } : { stale: true }
  }
}

/**
 * Owner-only controls (delivery choice, "I found it myself") are allowed only once ownership is confirmed. While it is
 * loading, or when the lookup failed (null), they stay hidden and inert, like for a known non-owner.
 */
export function canUseOwnerActions(ownership: boolean | null): boolean {
  return ownership === true
}
