// Shared mapping helpers used by every sub-module's controller. Centralised
// so we don't repeat snake_case → camelCase, ISO date formatting, and
// decimal → number conversion in every DTO.

export type F12Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type F12ProductCategory = 'meal' | 'snack' | 'beverage' | 'duty_free'
export type F12DietaryAttribute = 'halal' | 'vegetarian' | 'vegan' | 'kosher' | 'diabetic' | 'gluten_free'
export type F12SpecialMealCode = 'STD' | 'VGML' | 'MOML' | 'KSML' | 'DBML' | 'GFML'
export type F12OfferingScope = 'network' | 'route' | 'flight'
export type F12MealService = 'complimentary' | 'paid' | 'none'
export type F12MealSelection = 'choose' | 'fixed'
export type F12CateringOrderStatus = 'generated' | 'loaded' | 'closed' | 'void'
export type F12FlightReportStatus = 'submitted' | 'void'
export type F12StockMovementType = 'receive' | 'reserve' | 'release' | 'transfer' | 'discard' | 'adjust'
export type F12StockMovementReason = 'spoilage' | 'damage' | 'expired' | 'count_correction' | null

// Prisma returns Decimal as a Decimal.js object. Coerce to a number for the
// wire format; F12 only ever carries money/percentage values that fit
// safely in a JS number.
export function toNumber(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  // Prisma Decimal / Decimal.js
  const asAny = value as { toNumber?: () => number; toString: () => string }
  if (typeof asAny.toNumber === 'function') return asAny.toNumber()
  return Number(asAny.toString())
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === 'string') return new Date(value).toISOString()
  return value.toISOString()
}

export function toIsoRequired(value: Date | string | null | undefined): string {
  const out = toIso(value)
  if (!out) throw new Error('Expected a date')
  return out
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

// Settings resolution: flight → route → network. The most specific row
// wins per-column; NULL inherits from the next level up. Exported as a
// pure function so the cabin-settings controller can unit-test it
// without booting a Nest container.
export interface ResolvedCabinSetting {
  mealService: F12MealService
  mealSelection: F12MealSelection
  includedPerPassenger: number
  preorderEnabled: boolean
  orderWindowHours: number
  premiumMealsAllowed: boolean
  snacksEnabled: boolean
  dutyFreeEnabled: boolean
  onboardBufferPercent: number
}

export interface CabinSettingRow {
  scope: F12OfferingScope
  routeId: string | null
  flightId: string | null
  cabin: F12Cabin
  mealService: F12MealService | null
  mealSelection: F12MealSelection | null
  includedPerPassenger: number | null
  preorderEnabled: boolean | null
  orderWindowHours: number | null
  premiumMealsAllowed: boolean | null
  snacksEnabled: boolean | null
  dutyFreeEnabled: boolean | null
  onboardBufferPercent: number | null
}

const NETWORK_DEFAULTS: ResolvedCabinSetting = {
  mealService: 'complimentary',
  mealSelection: 'fixed',
  includedPerPassenger: 1,
  preorderEnabled: false,
  orderWindowHours: 48,
  premiumMealsAllowed: false,
  snacksEnabled: true,
  dutyFreeEnabled: false,
  onboardBufferPercent: 10,
}

export function resolveCabinSetting(
  rows: CabinSettingRow[],
  args: { cabin: F12Cabin; routeId?: string | null; flightId?: string | null },
): ResolvedCabinSetting {
  const networkRow = rows.find((r) => r.scope === 'network' && r.cabin === args.cabin) ?? null
  const routeRow = rows.find((r) => r.scope === 'route' && r.cabin === args.cabin && (args.routeId == null || r.routeId === args.routeId))
  const flightRow = rows.find(
    (r) => r.scope === 'flight' && r.cabin === args.cabin && (args.flightId == null || r.flightId === args.flightId),
  )
  return pickFirst([flightRow, routeRow, networkRow, { ...networkRow, scope: 'network' } as CabinSettingRow])
}

function pickFirst(rows: Array<CabinSettingRow | null | undefined>): ResolvedCabinSetting {
  const out: ResolvedCabinSetting = { ...NETWORK_DEFAULTS }
  // The first non-null value per column wins. Rows are passed in
  // precedence order: most specific (flight) first, then route, then
  // network, then the hard-coded defaults. We track which columns are
  // already set so the network row's non-null values don't clobber
  // a route- or flight-override.
  const fields: (keyof ResolvedCabinSetting)[] = [
    'mealService',
    'mealSelection',
    'includedPerPassenger',
    'preorderEnabled',
    'orderWindowHours',
    'premiumMealsAllowed',
    'snacksEnabled',
    'dutyFreeEnabled',
    'onboardBufferPercent',
  ]
  const set = new Set<keyof ResolvedCabinSetting>()
  for (const row of rows) {
    if (!row) continue
    for (const f of fields) {
      if (set.has(f)) continue
      const v = row[f] as unknown
      if (v != null) {
        ;(out as unknown as Record<string, unknown>)[f] = v
        set.add(f)
      }
    }
  }
  return out
}

// Shortest pre-order window across all four cabins. Used to compute
// the catering order's cutoff_at = scheduled_departure - window.
export function shortestOrderWindowHours(rows: CabinSettingRow[]): number {
  let shortest = Number.POSITIVE_INFINITY
  for (const row of rows) {
    if (row.orderWindowHours != null && row.orderWindowHours > 0) {
      shortest = Math.min(shortest, row.orderWindowHours)
    }
  }
  if (!Number.isFinite(shortest)) return 48
  return shortest
}

// Completion rule for one product line on a flight. Returns the
// number of units to discard (0 = nothing discarded).
export function applyCompletionRule(args: {
  category: F12ProductCategory
  totalOnAircraft: number
  // Per-batch state. Caller passes a flat map; we only need to know
  // whether any valid batch remains.
  hasValidBatch: boolean
}): { discardQty: number; afterLabel: 'discarded' | 'carried' | 'kept' } {
  const { category, totalOnAircraft, hasValidBatch } = args
  if (totalOnAircraft === 0) return { discardQty: 0, afterLabel: 'kept' }
  if (category === 'meal') return { discardQty: totalOnAircraft, afterLabel: 'discarded' }
  if (category === 'snack') return { discardQty: hasValidBatch ? 0 : totalOnAircraft, afterLabel: hasValidBatch ? 'carried' : 'discarded' }
  // beverage, duty_free: keep while valid; only damaged rows go.
  return { discardQty: hasValidBatch ? 0 : totalOnAircraft, afterLabel: hasValidBatch ? 'kept' : 'discarded' }
}
