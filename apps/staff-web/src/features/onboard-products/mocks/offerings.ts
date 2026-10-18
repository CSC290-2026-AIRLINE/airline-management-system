// Mock data for the offered menu, shaped to match product_offering and cabin_setting.
// Three scopes: network (one row per cabin), route (one route), flight (one flight).

import type { CabinSetting, ProductOffering, RouteSummary } from '../api/types'

export const mockNetworkOfferings: ProductOffering[] = [
  {
    id: 'po-net-eco',
    productId: 'p-001',
    scope: 'network',
    routeId: null,
    flightId: null,
    cabin: 'economy',
    isDefault: true,
    isActive: true,
  },
  {
    id: 'po-net-prem',
    productId: 'p-001',
    scope: 'network',
    routeId: null,
    flightId: null,
    cabin: 'premium_economy',
    isDefault: true,
    isActive: true,
  },
  {
    id: 'po-net-bus',
    productId: 'p-004',
    scope: 'network',
    routeId: null,
    flightId: null,
    cabin: 'business',
    isDefault: true,
    isActive: true,
  },
]

export const mockNetworkCabinSettings: CabinSetting[] = [
  {
    id: 'cs-net-eco',
    scope: 'network',
    routeId: null,
    flightId: null,
    cabin: 'economy',
    mealService: 'paid',
    mealSelection: 'choose',
    includedPerPassenger: 0,
    preorderEnabled: true,
    orderWindowHours: 48,
    premiumMealsAllowed: true,
    snacksEnabled: true,
    dutyFreeEnabled: true,
    onboardBufferPercent: 10,
  },
  {
    id: 'cs-net-prem',
    scope: 'network',
    routeId: null,
    flightId: null,
    cabin: 'premium_economy',
    mealService: 'paid',
    mealSelection: 'choose',
    includedPerPassenger: 0,
    preorderEnabled: true,
    orderWindowHours: 48,
    premiumMealsAllowed: true,
    snacksEnabled: true,
    dutyFreeEnabled: true,
    onboardBufferPercent: 10,
  },
  {
    id: 'cs-net-bus',
    scope: 'network',
    routeId: null,
    flightId: null,
    cabin: 'business',
    mealService: 'complimentary',
    mealSelection: 'choose',
    includedPerPassenger: 1,
    preorderEnabled: true,
    orderWindowHours: 48,
    premiumMealsAllowed: true,
    snacksEnabled: true,
    dutyFreeEnabled: true,
    onboardBufferPercent: 0,
  },
]

export const mockRoutes: RouteSummary[] = [
  {
    id: 'r-bkk-nrt',
    originAirport: 'BKK',
    destinationAirport: 'NRT',
    originCity: 'Bangkok',
    destinationCity: 'Tokyo',
    cabinStatuses: {
      economy: { state: 'inherited', mealService: 'paid' },
      premium_economy: { state: 'inherited', mealService: 'paid' },
      business: { state: 'inherited', mealService: 'complimentary' },
      first: { state: 'inherited', mealService: 'complimentary' },
    },
  },
  {
    id: 'r-nrt-bkk',
    originAirport: 'NRT',
    destinationAirport: 'BKK',
    originCity: 'Tokyo',
    destinationCity: 'Bangkok',
    cabinStatuses: {
      economy: { state: 'inherited', mealService: 'paid' },
      premium_economy: { state: 'inherited', mealService: 'paid' },
      business: { state: 'inherited', mealService: 'complimentary' },
      first: { state: 'inherited', mealService: 'complimentary' },
    },
  },
]

export const mockFlightExceptions: { id: string; routeId: string; flightNumber: string; reason: string }[] = [
  {
    id: 'f-308',
    routeId: 'r-bkk-nrt',
    flightNumber: 'FL308',
    reason: 'Special catering for charter group',
  },
]
