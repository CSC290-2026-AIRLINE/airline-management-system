import type { EarnRuleRow, LoyaltySettings, MemberDetail, MemberListItem, StaffLoyaltyApi, TierBenefits, TierCode, TierRule } from './types'

type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

// The backend's tier benefit shape (GET /api/staff/loyalty/tier-benefits). The pages name two fields differently.
interface ApiBenefits {
  loungeGuests: number | null
  extraBaggageKg: number
  priorityCheckIn: boolean
  priorityBoarding: boolean
  upgradeEligible: boolean
  insurance: TierBenefits['insurance']
}

interface ApiTier extends TierRule {
  benefits: ApiBenefits
}

const SETTING_KEYS: Record<keyof LoyaltySettings, string> = {
  milesRetentionMonths: 'miles_retention_months',
  expiryReminderDays: 'expiry_reminder_days',
  awardCutoffHours: 'award_cutoff_hours',
}

const fromApi = (b: ApiBenefits): TierBenefits => ({
  loungeGuests: b.loungeGuests,
  bonusBaggageKg: b.extraBaggageKg,
  priorityCheckIn: b.priorityCheckIn,
  priorityBoarding: b.priorityBoarding,
  complimentaryUpgrade: b.upgradeEligible,
  insurance: b.insurance,
})

const toApi = (b: TierBenefits): ApiBenefits => ({
  loungeGuests: b.loungeGuests,
  extraBaggageKg: b.bonusBaggageKg,
  priorityCheckIn: b.priorityCheckIn,
  priorityBoarding: b.priorityBoarding,
  upgradeEligible: b.complimentaryUpgrade,
  insurance: b.insurance,
})

// Every route answers errors as { error: { code, message, details? } }. A validation error carries the message per
// field in details.fields; the first one is more useful to staff than the generic summary.
async function readError(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: { message?: string; details?: { fields?: Record<string, string[]> } } }
    const field = Object.values(body.error?.details?.fields ?? {})[0]?.[0]
    if (field) return new Error(field)
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

const send = (method: 'POST' | 'PUT', body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const base = '/api/staff/loyalty'

/**
 * Member Lookup and Loyalty Rules over the Feature 11 staff routes. Award Release and the Lounge Desk have no backend
 * routes yet, so those four methods come from `fallback` (the demo data) until they do.
 */
export function createHttpStaffLoyaltyApi(
  fetchWithAuth: FetchWithAuth,
  fallback: Pick<StaffLoyaltyApi, 'getAwardFlights' | 'saveRelease' | 'checkInLounge' | 'getLoungeVisits'>,
): StaffLoyaltyApi {
  const get = async <T>(path: string) => json<T>(await fetchWithAuth(`${base}${path}`))

  return {
    async getRules() {
      const [tiers, benefits, earnRules, settings] = await Promise.all([
        get<TierRule[]>('/tier-rules'),
        get<ApiTier[]>('/tier-benefits'),
        get<EarnRuleRow[]>('/earn-rules'),
        get<LoyaltySettings>('/settings'),
      ])
      const byCode = Object.fromEntries(benefits.map((t) => [t.code, fromApi(t.benefits)])) as Record<TierCode, TierBenefits>
      return { tiers, benefits: byCode, earnRules, settings }
    },

    updateTier: async (code, patch) => json<TierRule>(await fetchWithAuth(`${base}/tier-rules/${code}`, send('PUT', patch))),

    updateTierBenefits: async (code, benefits) =>
      fromApi(await json<ApiBenefits>(await fetchWithAuth(`${base}/tier-benefits/${code}`, send('PUT', toApi(benefits))))),

    setEarnMultiplier: async (fareClassId, multiplier) =>
      json<EarnRuleRow>(await fetchWithAuth(`${base}/earn-rules/${encodeURIComponent(fareClassId)}`, send('PUT', { multiplier }))),

    // One PUT per changed key, so the audit log shows only what was changed.
    async updateSettings(next) {
      let current = await get<LoyaltySettings>('/settings')
      for (const field of Object.keys(SETTING_KEYS) as (keyof LoyaltySettings)[]) {
        if (next[field] === current[field]) continue
        current = await json<LoyaltySettings>(
          await fetchWithAuth(`${base}/settings/${SETTING_KEYS[field]}`, send('PUT', { value: next[field] })),
        )
      }
      return current
    },

    searchMembers: (query) => get<MemberListItem[]>(`/members?q=${encodeURIComponent(query.trim())}`),

    getMember: (id) => get<MemberDetail>(`/members/${encodeURIComponent(id)}`),

    adjustMiles: async (id, miles, reason) =>
      json<MemberDetail>(await fetchWithAuth(`${base}/members/${encodeURIComponent(id)}/adjustments`, send('POST', { miles, reason }))),

    getAwardFlights: () => fallback.getAwardFlights(),
    saveRelease: (flightId, cabin, released, milesCost) => fallback.saveRelease(flightId, cabin, released, milesCost),
    checkInLounge: (query, guests) => fallback.checkInLounge(query, guests),
    getLoungeVisits: () => fallback.getLoungeVisits(),
  }
}
