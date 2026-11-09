import type { AwardRoute, AwardSearchResult, BenefitUse, LoyaltyApi, MemberSummary, RedemptionRow, StatementRow, TierInfo } from './types'

type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

// Error format shared by every route: { error: { code, message, details? } }.
async function readError(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body.error?.message) return new Error(body.error.message)
  } catch {
    // Not JSON; fall through to the status text.
  }
  return new Error(`Request failed (${res.status}).`)
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

// Feature 11 customer routes (see the F11 doc, API routes). Calls go through the platform's fetchWithAuth.
export function createHttpLoyaltyApi(fetchWithAuth: FetchWithAuth): LoyaltyApi {
  return {
    getTiers: async () => json<TierInfo[]>(await fetchWithAuth('/api/loyalty/tier-benefits')),
    async getMember() {
      const res = await fetchWithAuth('/api/loyalty/members/me')
      if (res.status === 404) return null // signed in, but has not joined
      return json<MemberSummary>(res)
    },
    join: async () => json<MemberSummary>(await fetchWithAuth('/api/loyalty/members', { method: 'POST' })),
    getStatement: async () => json<StatementRow[]>(await fetchWithAuth('/api/loyalty/members/me/transactions')),
    getRedemptions: async () => json<RedemptionRow[]>(await fetchWithAuth('/api/loyalty/redemptions')),
    getBenefitUses: async () => json<BenefitUse[]>(await fetchWithAuth('/api/loyalty/members/me/benefits')),
    getAwardRoutes: async () => json<AwardRoute[]>(await fetchWithAuth('/api/loyalty/award-routes')),
    async searchAwardFlights(q) {
      const params = new URLSearchParams({ origin: q.origin, destination: q.destination, date: q.date, seats: String(q.seats) })
      return json<AwardSearchResult>(await fetchWithAuth(`/api/loyalty/award-flights?${params.toString()}`))
    },
  }
}
