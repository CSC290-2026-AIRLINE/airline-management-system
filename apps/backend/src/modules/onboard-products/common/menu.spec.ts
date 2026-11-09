// Tests for the menu resolution rules. The "most specific level
// replaces the others as a whole" rule and the premium-economy
// follow are easy to get subtly wrong, so they are pinned here.

import { defaultOffering, resolveOfferings, type OfferingRow } from './menu'

function row(partial: Partial<OfferingRow> & { productId: string }): OfferingRow {
  return {
    id: partial.productId,
    scope: 'network',
    routeId: null,
    flightId: null,
    cabin: 'economy',
    isDefault: false,
    isActive: true,
    ...partial,
  }
}

const SCOPE = { flightId: 'f1', routeId: 'r1', cabin: 'economy' as const }

describe('resolveOfferings', () => {
  it('falls back to the network menu', () => {
    const rows = [row({ productId: 'p1' }), row({ productId: 'p2' })]
    expect(resolveOfferings(rows, SCOPE).map((r) => r.productId)).toEqual(['p1', 'p2'])
  })

  it('replaces the network menu with the route menu, without merging', () => {
    const rows = [row({ productId: 'net-1' }), row({ productId: 'net-2' }), row({ productId: 'route-1', scope: 'route', routeId: 'r1' })]
    expect(resolveOfferings(rows, SCOPE).map((r) => r.productId)).toEqual(['route-1'])
  })

  it('replaces the route menu with the flight menu, without merging', () => {
    const rows = [
      row({ productId: 'net-1' }),
      row({ productId: 'route-1', scope: 'route', routeId: 'r1' }),
      row({ productId: 'flight-1', scope: 'flight', flightId: 'f1' }),
    ]
    expect(resolveOfferings(rows, SCOPE).map((r) => r.productId)).toEqual(['flight-1'])
  })

  it('ignores rows for another route or another flight', () => {
    const rows = [
      row({ productId: 'route-other', scope: 'route', routeId: 'r2' }),
      row({ productId: 'flight-other', scope: 'flight', flightId: 'f2' }),
      row({ productId: 'net-1' }),
    ]
    expect(resolveOfferings(rows, SCOPE).map((r) => r.productId)).toEqual(['net-1'])
  })

  it('ignores deactivated rows', () => {
    const rows = [row({ productId: 'p1' }), row({ productId: 'p2', isActive: false })]
    expect(resolveOfferings(rows, SCOPE).map((r) => r.productId)).toEqual(['p1'])
  })

  it('reads the economy menu for premium economy', () => {
    const rows = [row({ productId: 'econ-1' }), row({ productId: 'prem-1', cabin: 'premium_economy' })]
    expect(resolveOfferings(rows, { ...SCOPE, cabin: 'premium_economy' }).map((r) => r.productId)).toEqual(['econ-1'])
  })

  it('does not read the business menu for economy', () => {
    const rows = [row({ productId: 'biz-1', cabin: 'business' }), row({ productId: 'econ-1' })]
    expect(resolveOfferings(rows, SCOPE).map((r) => r.productId)).toEqual(['econ-1'])
  })
})

describe('defaultOffering', () => {
  it('finds the default meal at the resolved level', () => {
    const rows = [row({ productId: 'p1' }), row({ productId: 'p2', isDefault: true, scope: 'route', routeId: 'r1' })]
    expect(defaultOffering(rows, SCOPE)?.productId).toBe('p2')
  })

  it('returns null when no row is the default', () => {
    expect(defaultOffering([row({ productId: 'p1' })], SCOPE)).toBeNull()
  })
})
