// Menu resolution: which products are on a flight's menu for a cabin.
//
// The doc's rule is deliberately blunt: the most specific level that
// has any row for a cabin replaces the less specific ones as a whole.
// There is no merging — a route with one economy row does not also
// carry the network economy rows.
//
// Premium economy follows the economy menu: it has its own rules but
// no rows of its own, so a premium_economy lookup reads the economy
// rows.

import type { F12Cabin } from './mapping'

export interface OfferingRow {
  id: string
  productId: string
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
export function offeringsInScope(rows: OfferingRow[], scope: MenuScope): OfferingRow[] {
  const cabin = menuCabinFor(scope.cabin)
  return rows.filter((row) => {
    if (!row.isActive) return false
    if (row.cabin !== cabin) return false
    if (row.scope === 'network') return row.routeId === null && row.flightId === null
    if (row.scope === 'route') return row.routeId === scope.routeId && row.flightId === null
    return row.flightId === scope.flightId && row.routeId === null
  })
}

// The menu for a flight and cabin. The most specific level with any row
// replaces the others as a whole.
export function resolveOfferings(rows: OfferingRow[], scope: MenuScope): OfferingRow[] {
  const scoped = offeringsInScope(rows, scope)
  const flightRows = scoped.filter((r) => r.scope === 'flight')
  if (flightRows.length > 0) return flightRows
  const routeRows = scoped.filter((r) => r.scope === 'route')
  if (routeRows.length > 0) return routeRows
  return scoped.filter((r) => r.scope === 'network')
}

// The default meal for a cabin: the one offering flagged as default at
// the resolved level.
export function defaultOffering(rows: OfferingRow[], scope: MenuScope): OfferingRow | null {
  return resolveOfferings(rows, scope).find((r) => r.isDefault) ?? null
}
