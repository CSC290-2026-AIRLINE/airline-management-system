// Pure resolution logic for cabin settings and product offerings.
//
// Three levels of precedence: flight (most specific) → route → network (fallback).
// A null value at the current level inherits from the next level up, not from
// the previous level. The network row for each cabin holds every value.
//
// The same "most specific with any row replaces the others" rule applies to
// product offerings, with one extra wrinkle: premium economy follows the
// economy menu and has no rows of its own.

import type { Cabin, CabinSetting, ProductOffering } from '../api/types'

export type CabinSettingKey =
  | 'mealService'
  | 'mealSelection'
  | 'includedPerPassenger'
  | 'preorderEnabled'
  | 'orderWindowHours'
  | 'premiumMealsAllowed'
  | 'snacksEnabled'
  | 'dutyFreeEnabled'
  | 'onboardBufferPercent'

export type ResolvedLevel = 'flight' | 'route' | 'network' | 'none'

export interface ResolvedSetting<K extends CabinSettingKey> {
  key: K
  value: NonNullable<CabinSetting[K]>
  level: ResolvedLevel
  // Where the value actually came from, for the "Inherited from" label.
  sourceRouteId: string | null
  sourceFlightId: string | null
}

export type ResolvedCabinSettings = {
  [K in CabinSettingKey]: ResolvedSetting<K>
}

// Holds the full set of cabins; we resolve each in turn. Premium economy's
// menu borrows economy's; the settings are its own.
export interface ResolvedScope {
  cabin: Cabin
  settings: ResolvedCabinSettings
  menu: ProductOffering[]
  defaultOfferingId: string | null
}

function findSetting(
  rows: CabinSetting[],
  scope: 'flight' | 'route' | 'network',
  cabin: Cabin,
  routeId: string | null,
  flightId: string | null,
): CabinSetting | null {
  return (
    rows.find((r) => {
      if (r.scope !== scope) return false
      if (r.cabin !== cabin) return false
      if (scope === 'flight') return r.flightId === flightId
      if (scope === 'route') return r.routeId === routeId
      return true
    }) ?? null
  )
}

// Walk flight → route → network and return the first non-null value, along
// with the level that produced it. The source IDs are taken from the row
// that actually held the value (so the UI can show "Inherited from network").
function resolveOne<K extends CabinSettingKey>(
  rows: CabinSetting[],
  key: K,
  cabin: Cabin,
  routeId: string | null,
  flightId: string | null,
): ResolvedSetting<K> {
  for (const level of ['flight', 'route', 'network'] as const) {
    const row = findSetting(rows, level, cabin, routeId, flightId)
    const v = row?.[key]
    if (v != null) {
      return {
        key,
        value: v as NonNullable<CabinSetting[K]>,
        level,
        sourceRouteId: row?.routeId ?? null,
        sourceFlightId: row?.flightId ?? null,
      }
    }
  }
  // Should not happen in the prototype (network always has a full row),
  // but fall back to a reasonable default so the page still renders.
  return {
    key,
    value: defaultFor(key) as NonNullable<CabinSetting[K]>,
    level: 'none',
    sourceRouteId: null,
    sourceFlightId: null,
  }
}

function defaultFor(key: CabinSettingKey): CabinSetting[CabinSettingKey] {
  switch (key) {
    case 'mealService':
      return 'paid'
    case 'mealSelection':
      return 'choose'
    case 'includedPerPassenger':
      return 0
    case 'preorderEnabled':
      return true
    case 'orderWindowHours':
      return 48
    case 'premiumMealsAllowed':
      return true
    case 'snacksEnabled':
      return true
    case 'dutyFreeEnabled':
      return true
    case 'onboardBufferPercent':
      return 0
  }
}

const ALL_KEYS: CabinSettingKey[] = [
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

export function resolveCabinSettings(
  rows: CabinSetting[],
  cabin: Cabin,
  routeId: string | null,
  flightId: string | null,
): ResolvedCabinSettings {
  const out = {} as ResolvedCabinSettings
  for (const k of ALL_KEYS) {
    // The cast is safe: each key has its own K in the iteration.
    out[k] = resolveOne(rows, k, cabin, routeId, flightId) as never
  }
  return out
}

// Menu resolution: the most specific level that has ANY row for a cabin
// replaces the other levels as a whole. Premium economy follows economy.
export function resolveMenu(
  offerings: ProductOffering[],
  cabin: Cabin,
  routeId: string | null,
  flightId: string | null,
): { menu: ProductOffering[]; defaultOfferingId: string | null; menuLevel: ResolvedLevel } {
  // Premium economy always borrows economy's menu.
  const effectiveCabin = cabin === 'premium_economy' ? 'economy' : cabin

  // Order: flight, then route, then network. The first level with at least
  // one row wins; the level's full set replaces everything else.
  for (const level of ['flight', 'route', 'network'] as const) {
    const filtered = offerings.filter((o) => {
      if (o.cabin !== effectiveCabin) return false
      if (level === 'flight') return o.flightId === flightId
      if (level === 'route') return o.routeId === routeId
      return o.scope === 'network'
    })
    if (filtered.length > 0) {
      const def = filtered.find((o) => o.isDefault) ?? null
      return { menu: filtered, defaultOfferingId: def?.id ?? null, menuLevel: level }
    }
  }
  return { menu: [], defaultOfferingId: null, menuLevel: 'none' }
}

export function labelForLevel(level: ResolvedLevel): 'Custom' | 'Inherited' {
  return level === 'flight' || level === 'route' ? 'Custom' : 'Inherited'
}

export function describeInheritance(level: ResolvedLevel, _routeId: string | null, flightId: string | null): string {
  if (level === 'flight') return 'Inherited from this flight'
  if (level === 'route' && _routeId) return `Inherited from route ${_routeId}`
  if (level === 'route') return 'Inherited from this route'
  if (level === 'network') return 'Inherited from network default'
  if (level === 'none') return 'No value set'
  void flightId
  return 'No value set'
}
