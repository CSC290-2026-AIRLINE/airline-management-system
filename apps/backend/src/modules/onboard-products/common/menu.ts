// Menu resolution: which products are on a flight's menu for a cabin.
//
// Meal menus use the most specific scope that has an active meal.
// Snacks, drinks and duty-free inherit per product. An inactive scoped
// offering hides that product at that scope without replacing the menu.
//
//// Premium economy follows the economy menu: it has its own rules but
// no rows of its own, so a premium_economy lookup reads the economy
// rows.

import type { F12Cabin, F12ProductCategory } from './mapping'

export interface OfferingRow {
  id: string
  productId: string
  category: F12ProductCategory
  scope: 'network' | 'route' | 'flight'
  routeId: string | null
  flightId: string | null
  cabin: F12Cabin
  isDefault: boolean
  isActive: boolean
}

export interface MenuScope {
  flightId: string
  routeId: string
  cabin: F12Cabin
}

// Premium economy reads the economy menu.
export function menuCabinFor(cabin: F12Cabin): F12Cabin {
  return cabin === 'premium_economy' ? 'economy' : cabin
}

// The rows that apply to the scope, before the most-specific-level rule.
export function offeringsInScope(rows: OfferingRow[], scope: MenuScope, includeInactive = false): OfferingRow[] {
  const cabin = menuCabinFor(scope.cabin)
  return rows.filter((row) => {
    if (!includeInactive && !row.isActive) return false
    if (row.cabin !== cabin) return false
    if (row.scope === 'network') return row.routeId === null && row.flightId === null
    if (row.scope === 'route') return row.routeId === scope.routeId && row.flightId === null
    return row.flightId === scope.flightId && row.routeId === null
  })
}

// Resolve the meal menu and the individual non-meal offerings.
export function resolveOfferings(rows: OfferingRow[], scope: MenuScope): OfferingRow[] {
  const scoped = offeringsInScope(rows, scope, true)
  const meals = scoped.filter((row) => row.category === 'meal' && row.isActive)
  const extras = new Map<string, OfferingRow>()
  for (const level of ['network', 'route', 'flight'] as const) {
    for (const row of scoped) {
      if (row.scope === level && row.category !== 'meal') extras.set(row.productId, row)
    }
  }
  const mealLevel = (['flight', 'route', 'network'] as const).find((level) => meals.some((row) => row.scope === level))
  return [...meals.filter((row) => row.scope === mealLevel), ...[...extras.values()].filter((row) => row.isActive)]
}

// The default meal for a cabin: the one offering flagged as default at
// the resolved level.
export function defaultOffering(rows: OfferingRow[], scope: MenuScope): OfferingRow | null {
  return resolveOfferings(rows, scope).find((r) => r.category === 'meal' && r.isDefault) ?? null
}
