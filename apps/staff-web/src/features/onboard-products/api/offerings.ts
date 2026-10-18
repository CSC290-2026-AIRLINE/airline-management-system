// API for the offered menu (network default, routes, single-flight exceptions).
// Mirrors /staff/product-offerings, /staff/cabin-settings, /staff/flights/:flightId/cabin-settings.

import { delay } from '../mocks/delay'
import { mockFlightExceptions, mockNetworkCabinSettings, mockNetworkOfferings, mockRoutes } from '../mocks/offerings'
import type { CabinSetting, ProductOffering, RouteSummary } from './types'

export interface OfferedMenu {
  networkOfferings: ProductOffering[]
  networkCabinSettings: CabinSetting[]
  routes: RouteSummary[]
  flightExceptions: { id: string; routeId: string; flightNumber: string; reason: string }[]
}

export async function getOfferedMenu(): Promise<OfferedMenu> {
  await delay()
  return {
    networkOfferings: mockNetworkOfferings,
    networkCabinSettings: mockNetworkCabinSettings,
    routes: mockRoutes,
    flightExceptions: mockFlightExceptions,
  }
}

export async function getRouteDetail(routeId: string): Promise<{
  route: RouteSummary | null
  offerings: ProductOffering[]
  cabinSettings: CabinSetting[]
}> {
  await delay()
  return {
    route: mockRoutes.find((r) => r.id === routeId) ?? null,
    offerings: mockNetworkOfferings,
    cabinSettings: mockNetworkCabinSettings,
  }
}
