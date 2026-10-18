// API for the offered menu and route detail.
//
// Backed by an in-memory mutable store. Edits and bulk actions persist
// across page navigations; a full reload resets everything. Throws typed
// errors so the UI can map a code to a friendly message.

import { delay } from '../mocks/delay'
import {
  mockFlightCabinSettings,
  mockFlightExceptions,
  mockNetworkCabinSettings,
  mockNetworkOfferings,
  mockRouteCabinSettings,
  mockRouteOfferings,
  mockRoutes,
} from '../mocks/offerings'
import type {
  Cabin,
  CabinSetting,
  FlightException,
  FlightSummary,
  MealService,
  OfferingScope,
  ProductOffering,
  RouteDetail,
  RouteFilter,
  RouteSummary,
  SettingPatch,
} from './types'

// --- Mutable store --------------------------------------------------------

const settingsStore: CabinSetting[] = [...mockNetworkCabinSettings, ...mockRouteCabinSettings, ...mockFlightCabinSettings]

const offeringsStore: ProductOffering[] = [...mockNetworkOfferings, ...mockRouteOfferings]

const routeOverrides: Set<string> = new Set(mockRouteCabinSettings.filter((s) => s.routeId != null).map((s) => `${s.routeId}:${s.cabin}`))

const routeMenuOverrides: Set<string> = new Set(mockRouteOfferings.filter((o) => o.routeId != null).map((o) => `${o.routeId}:${o.cabin}`))

// --- Errors ---------------------------------------------------------------

export class OfferingsApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'OfferingsApiError'
  }
}

export class SettingInvalidError extends OfferingsApiError {
  constructor(message: string) {
    super('SETTING_INVALID', message)
    this.name = 'SettingInvalidError'
  }
}

export class MealPolicyInvalidError extends OfferingsApiError {
  constructor(message: string) {
    super('MEAL_POLICY_INVALID', message)
    this.name = 'MealPolicyInvalidError'
  }
}

// --- Helpers --------------------------------------------------------------

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

function cloneRoute(r: RouteSummary): RouteSummary {
  return {
    ...r,
    cabinStatuses: { ...r.cabinStatuses },
  }
}

// The settings row for a given scope+routeId+flightId+cabin (single row per
// combination in the prototype, matching the spec).
function findSetting(scope: OfferingScope, routeId: string | null, flightId: string | null, cabin: Cabin): CabinSetting | null {
  return (
    settingsStore.find((r) => {
      if (r.scope !== scope) return false
      if (r.cabin !== cabin) return false
      if (scope === 'flight') return r.flightId === flightId
      if (scope === 'route') return r.routeId === routeId
      return true
    }) ?? null
  )
}

function syncRouteStatus(routeId: string) {
  // If all values for a route+cabin are null again, treat the row as
  // fully inherited so the Custom badge goes away.
  const route = mockRoutes.find((r) => r.id === routeId)
  if (!route) return
  for (const cabin of ['economy', 'premium_economy', 'business', 'first'] as Cabin[]) {
    const row = findSetting('route', routeId, null, cabin)
    const hasAny = row
      ? [
          row.mealService,
          row.mealSelection,
          row.includedPerPassenger,
          row.preorderEnabled,
          row.orderWindowHours,
          row.premiumMealsAllowed,
          row.snacksEnabled,
          row.dutyFreeEnabled,
          row.onboardBufferPercent,
        ].some((v) => v != null)
      : false
    const key = `${routeId}:${cabin}`
    if (hasAny) {
      routeOverrides.add(key)
    } else {
      routeOverrides.delete(key)
    }
    const networkRow = findSetting('network', null, null, cabin)
    route.cabinStatuses[cabin] = {
      state: routeOverrides.has(key) ? 'custom' : 'inherited',
      mealService: (row?.mealService ?? networkRow?.mealService ?? 'paid') as MealService,
    }
  }
}

function customChipsForRoute(route: RouteSummary): string {
  const out: string[] = []
  for (const cabin of ['economy', 'premium_economy', 'business'] as Cabin[]) {
    if (route.cabinStatuses[cabin].state === 'custom') {
      out.push(cabin.replace('_', ' '))
    }
  }
  if (out.length === 0) return 'Inherited'
  return `Custom (${out.join(', ')})`
}

// --- Public read API ------------------------------------------------------

export interface OfferedMenu {
  networkOfferings: ProductOffering[]
  networkCabinSettings: CabinSetting[]
  routes: RouteSummary[]
  flightExceptions: FlightException[]
}

export async function getOfferedMenu(): Promise<OfferedMenu> {
  await delay()
  return {
    networkOfferings: mockNetworkOfferings,
    networkCabinSettings: mockNetworkCabinSettings,
    routes: mockRoutes.map(cloneRoute),
    flightExceptions: mockFlightExceptions,
  }
}

export async function listRoutes(filter: RouteFilter): Promise<{
  total: number
  totalCustomized: number
  routes: RouteSummary[]
}> {
  await delay()
  const search = filter.search.trim().toLowerCase()
  let totalCustomized = 0
  const all = mockRoutes.filter((r) => {
    if (search) {
      const hay = `${r.originAirport} ${r.destinationAirport} ${r.originCity} ${r.destinationCity}`.toLowerCase()
      if (!hay.includes(search)) return false
    }
    if (filter.cabin !== 'all') {
      if (r.cabinStatuses[filter.cabin].state === 'inherited' && filter.status === 'customized') return false
    }
    if (filter.mealService !== 'all') {
      // The route's effective service is the route value when set, else network.
      const row = findSetting('route', r.id, null, filter.cabin === 'all' ? 'economy' : filter.cabin)
      const network = findSetting('network', null, null, filter.cabin === 'all' ? 'economy' : filter.cabin)
      const service = row?.mealService ?? network?.mealService
      if (service !== filter.mealService) return false
    }
    return true
  })
  for (const r of all) {
    if (Object.values(r.cabinStatuses).some((c) => c.state === 'custom')) totalCustomized++
  }
  let filtered = all
  if (filter.status === 'customized') {
    filtered = all.filter((r) => Object.values(r.cabinStatuses).some((c) => c.state === 'custom'))
  } else if (filter.status === 'inherited') {
    filtered = all.filter((r) => Object.values(r.cabinStatuses).every((c) => c.state === 'inherited'))
  }
  return { total: all.length, totalCustomized, routes: filtered.map(cloneRoute) }
}

export async function listFlightExceptions(filter: { search: string }): Promise<{ total: number; exceptions: FlightException[] }> {
  await delay()
  const search = filter.search.trim().toLowerCase()
  const exceptions = mockFlightExceptions.filter((e) => {
    if (!search) return true
    return e.flightNumber.toLowerCase().includes(search)
  })
  return { total: exceptions.length, exceptions }
}

export async function getRouteDetail(routeId: string): Promise<RouteDetail> {
  await delay()
  const route = mockRoutes.find((r) => r.id === routeId) ?? null
  const cabinSettings = settingsStore.filter((s) => {
    if (s.scope === 'network') return true
    if (s.scope === 'route') return s.routeId === routeId
    return s.routeId === routeId
  })
  const offerings = offeringsStore.filter((o) => {
    if (o.scope === 'network') return true
    if (o.scope === 'route') return o.routeId === routeId
    return o.routeId === routeId
  })
  const flights = mockFlightExceptions
    .filter((e) => e.routeId === routeId)
    .map<FlightSummary>((e) => ({
      id: e.id,
      flightNumber: e.flightNumber,
      routeId: e.routeId,
      scheduledDeparture: e.scheduledDeparture,
      departureAirport: route?.originAirport ?? '',
      arrivalAirport: route?.destinationAirport ?? '',
      hasException: true,
      exceptionSummary: `${e.cabin.replace('_', ' ')}: ${e.changedSettings.join(', ')}`,
    }))
  return { route: route ? cloneRoute(route) : null, cabinSettings, offerings, flights }
}

export async function getNetworkDefault(): Promise<{
  cabinSettings: CabinSetting[]
  offerings: ProductOffering[]
}> {
  await delay()
  return {
    cabinSettings: settingsStore.filter((s) => s.scope === 'network'),
    offerings: offeringsStore.filter((o) => o.scope === 'network'),
  }
}

export async function getFlightCabinSettings(flightId: string): Promise<CabinSetting[]> {
  await delay()
  return settingsStore.filter((s) => s.scope === 'flight' && s.flightId === flightId)
}

export async function listProductOfferings(routeId: string, cabin: Cabin): Promise<ProductOffering[]> {
  await delay()
  return offeringsStore.filter((o) => (o.routeId === routeId || o.scope === 'network') && o.cabin === cabin)
}

// --- Public write API -----------------------------------------------------

function validateSettings(patch: SettingPatch, current: CabinSetting | null, scope: 'network' | 'route' | 'flight', cabin: Cabin): void {
  const merged: Record<string, unknown> = {
    mealService: current?.mealService ?? 'paid',
    mealSelection: current?.mealSelection ?? 'choose',
    includedPerPassenger: current?.includedPerPassenger ?? 0,
    preorderEnabled: current?.preorderEnabled ?? true,
    orderWindowHours: current?.orderWindowHours ?? 48,
    premiumMealsAllowed: current?.premiumMealsAllowed ?? true,
    snacksEnabled: current?.snacksEnabled ?? true,
    dutyFreeEnabled: current?.dutyFreeEnabled ?? true,
    onboardBufferPercent: current?.onboardBufferPercent ?? 0,
    ...patch,
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) continue
    switch (k) {
      case 'includedPerPassenger':
        if (typeof v !== 'number' || v < 0 || v > 1) {
          throw new SettingInvalidError('Included meals per passenger must be 0 or 1.')
        }
        break
      case 'orderWindowHours':
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          throw new SettingInvalidError('Order window hours must be a non-negative whole number.')
        }
        break
      case 'onboardBufferPercent':
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) {
          throw new SettingInvalidError('On-board buffer percent must be between 0 and 100.')
        }
        break
      case 'mealService':
        if (v === 'none' && cabin === 'premium_economy') {
          throw new MealPolicyInvalidError('Premium economy must keep a meal service.')
        }
        break
    }
  }
  if (merged.mealService === 'complimentary' && merged.includedPerPassenger === 0 && cabin !== 'premium_economy') {
    // Not invalid per se but a UX hint: when complimentary with 0 included
    // there's no free meal. We don't throw; the UI shows a warning instead.
  }
  void scope
}

// Count the open orders that the next set of settings would affect. The
// prototype returns a stable mock number so the UI can render the warning.
function affectedOpenOrdersFor(
  scope: 'network' | 'route' | 'flight',
  routeId: string | null,
  flightId: string | null,
  cabin: Cabin,
): number {
  // Tiny pseudo-random but deterministic value.
  const seed = `${scope}:${routeId ?? ''}:${flightId ?? ''}:${cabin}`
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return (h % 12) + 1
}

export interface PutSettingsResult {
  setting: CabinSetting
  affectedOpenOrders: number
}

export async function putCabinSettings(
  scope: 'network' | 'route' | 'flight',
  routeId: string | null,
  flightId: string | null,
  cabin: Cabin,
  patch: SettingPatch,
): Promise<PutSettingsResult> {
  await delay()
  if (scope === 'network' && routeId == null && flightId == null) {
    // network scope, ok
  } else if (scope === 'route' && routeId) {
    // ok
  } else if (scope === 'flight' && flightId) {
    // ok
  } else {
    throw new SettingInvalidError('Scope, routeId, and flightId are inconsistent.')
  }

  const existing = findSetting(scope, routeId, flightId, cabin)
  if (scope === 'network') {
    if (existing) validateSettings(patch, existing, scope, cabin)
    const merged: CabinSetting = {
      id: existing?.id ?? nextId('cs-net'),
      scope: 'network',
      routeId: null,
      flightId: null,
      cabin,
      mealService: patch.mealService ?? existing?.mealService ?? 'paid',
      mealSelection: patch.mealSelection ?? existing?.mealSelection ?? 'choose',
      includedPerPassenger: patch.includedPerPassenger ?? existing?.includedPerPassenger ?? 0,
      preorderEnabled: patch.preorderEnabled ?? existing?.preorderEnabled ?? true,
      orderWindowHours: patch.orderWindowHours ?? existing?.orderWindowHours ?? 48,
      premiumMealsAllowed: patch.premiumMealsAllowed ?? existing?.premiumMealsAllowed ?? true,
      snacksEnabled: patch.snacksEnabled ?? existing?.snacksEnabled ?? true,
      dutyFreeEnabled: patch.dutyFreeEnabled ?? existing?.dutyFreeEnabled ?? true,
      onboardBufferPercent: patch.onboardBufferPercent ?? existing?.onboardBufferPercent ?? 10,
    }
    if (existing) {
      const i = settingsStore.indexOf(existing)
      settingsStore[i] = merged
    } else {
      settingsStore.push(merged)
    }
    return { setting: merged, affectedOpenOrders: 0 }
  }

  validateSettings(patch, existing, scope, cabin)
  const merged: CabinSetting = {
    id: existing?.id ?? nextId(scope === 'route' ? 'cs-rt' : 'cs-fl'),
    scope,
    routeId: scope === 'route' ? routeId : (existing?.routeId ?? null),
    flightId: scope === 'flight' ? flightId : (existing?.flightId ?? null),
    cabin,
    mealService: patch.mealService === undefined ? (existing?.mealService ?? null) : patch.mealService,
    mealSelection: patch.mealSelection === undefined ? (existing?.mealSelection ?? null) : patch.mealSelection,
    includedPerPassenger: patch.includedPerPassenger === undefined ? (existing?.includedPerPassenger ?? null) : patch.includedPerPassenger,
    preorderEnabled: patch.preorderEnabled === undefined ? (existing?.preorderEnabled ?? null) : patch.preorderEnabled,
    orderWindowHours: patch.orderWindowHours === undefined ? (existing?.orderWindowHours ?? null) : patch.orderWindowHours,
    premiumMealsAllowed: patch.premiumMealsAllowed === undefined ? (existing?.premiumMealsAllowed ?? null) : patch.premiumMealsAllowed,
    snacksEnabled: patch.snacksEnabled === undefined ? (existing?.snacksEnabled ?? null) : patch.snacksEnabled,
    dutyFreeEnabled: patch.dutyFreeEnabled === undefined ? (existing?.dutyFreeEnabled ?? null) : patch.dutyFreeEnabled,
    onboardBufferPercent: patch.onboardBufferPercent === undefined ? (existing?.onboardBufferPercent ?? null) : patch.onboardBufferPercent,
  }
  // Drop empties at route/flight so the Custom badge clears.
  const hasAny = [
    merged.mealService,
    merged.mealSelection,
    merged.includedPerPassenger,
    merged.preorderEnabled,
    merged.orderWindowHours,
    merged.premiumMealsAllowed,
    merged.snacksEnabled,
    merged.dutyFreeEnabled,
    merged.onboardBufferPercent,
  ].some((v) => v != null)

  if (!hasAny) {
    if (existing) {
      const i = settingsStore.indexOf(existing)
      settingsStore.splice(i, 1)
    }
    if (scope === 'route' && routeId) syncRouteStatus(routeId)
    return { setting: merged, affectedOpenOrders: 0 }
  }

  if (existing) {
    const i = settingsStore.indexOf(existing)
    settingsStore[i] = merged
  } else {
    settingsStore.push(merged)
  }
  if (scope === 'route' && routeId) syncRouteStatus(routeId)
  const affected = affectedOpenOrdersFor(scope, routeId, flightId, cabin)
  return { setting: merged, affectedOpenOrders: affected }
}

export async function resetCabinSettingsToInherited(
  scope: 'route' | 'flight',
  routeId: string | null,
  flightId: string | null,
  cabin: Cabin,
): Promise<void> {
  await delay()
  const existing = findSetting(scope, routeId, flightId, cabin)
  if (existing) {
    const i = settingsStore.indexOf(existing)
    settingsStore.splice(i, 1)
  }
  if (scope === 'route' && routeId) syncRouteStatus(routeId)
}

export interface ProductOfferingInput {
  productId: string
  scope: 'network' | 'route' | 'flight'
  routeId: string | null
  flightId: string | null
  cabin: Cabin
  isDefault: boolean
  isActive: boolean
}

export async function createProductOffering(input: ProductOfferingInput): Promise<ProductOffering> {
  await delay()
  // If marking as default, clear other defaults at the same level+cabin.
  if (input.isDefault) {
    for (const o of offeringsStore) {
      if (
        o.cabin === input.cabin &&
        o.scope === input.scope &&
        ((input.scope === 'flight' && o.flightId === input.flightId) ||
          (input.scope === 'route' && o.routeId === input.routeId) ||
          input.scope === 'network')
      ) {
        o.isDefault = false
      }
    }
  }
  const row: ProductOffering = {
    id: nextId('po'),
    productId: input.productId,
    scope: input.scope,
    routeId: input.routeId,
    flightId: input.flightId,
    cabin: input.cabin,
    isDefault: input.isDefault,
    isActive: input.isActive,
  }
  offeringsStore.push(row)
  if (input.scope === 'route' && input.routeId) {
    routeMenuOverrides.add(`${input.routeId}:${input.cabin}`)
  }
  return row
}

export async function updateProductOffering(id: string, patch: { isDefault?: boolean; isActive?: boolean }): Promise<ProductOffering> {
  await delay()
  const i = offeringsStore.findIndex((o) => o.id === id)
  if (i < 0) throw new OfferingsApiError('OFFERING_NOT_FOUND', 'Offering not found.')
  const existing = offeringsStore[i]
  if (patch.isDefault) {
    for (const o of offeringsStore) {
      if (
        o.cabin === existing.cabin &&
        o.scope === existing.scope &&
        o.id !== id &&
        ((existing.scope === 'flight' && o.flightId === existing.flightId) ||
          (existing.scope === 'route' && o.routeId === existing.routeId) ||
          existing.scope === 'network')
      ) {
        o.isDefault = false
      }
    }
  }
  const updated: ProductOffering = { ...existing, ...patch }
  offeringsStore[i] = updated
  return updated
}

export async function deleteProductOffering(id: string): Promise<void> {
  await delay()
  const i = offeringsStore.findIndex((o) => o.id === id)
  if (i < 0) return
  const existing = offeringsStore[i]
  offeringsStore.splice(i, 1)
  if (existing.scope === 'route' && existing.routeId) {
    // If route+ cabin has no offerings left, drop the override so it inherits.
    const remaining = offeringsStore.some((o) => o.scope === 'route' && o.routeId === existing.routeId && o.cabin === existing.cabin)
    if (!remaining) routeMenuOverrides.delete(`${existing.routeId}:${existing.cabin}`)
  }
}

export interface BulkOfferResult {
  affectedRoutes: number
  affectedCabins: number
}

export async function bulkOffer(filter: RouteFilter, productId: string, cabin: Cabin): Promise<BulkOfferResult> {
  await delay()
  const { routes } = await listRoutes(filter)
  let affectedCabins = 0
  for (const r of routes) {
    // Skip routes that already have a custom menu for this cabin? No — bulk
    // means "add this meal to every matching route's network-replacing menu".
    // For the prototype we add a route-level row.
    offeringsStore.push({
      id: nextId('po-rt'),
      productId,
      scope: 'route',
      routeId: r.id,
      flightId: null,
      cabin,
      isDefault: false,
      isActive: true,
    })
    routeMenuOverrides.add(`${r.id}:${cabin}`)
    affectedCabins++
  }
  return { affectedRoutes: routes.length, affectedCabins }
}

export async function bulkWithdraw(filter: RouteFilter, productId: string, cabin: Cabin): Promise<BulkOfferResult> {
  await delay()
  const { routes } = await listRoutes(filter)
  const routeIds = new Set(routes.map((r) => r.id))
  let removed = 0
  for (let i = offeringsStore.length - 1; i >= 0; i--) {
    const o = offeringsStore[i]
    if (o.productId !== productId || o.cabin !== cabin) continue
    if (o.scope === 'route' && o.routeId && routeIds.has(o.routeId)) {
      offeringsStore.splice(i, 1)
      removed++
    }
  }
  return { affectedRoutes: routes.length, affectedCabins: removed }
}

export async function clearFlightException(flightId: string): Promise<void> {
  await delay()
  // Remove all flight-level settings for that flight.
  for (let i = settingsStore.length - 1; i >= 0; i--) {
    if (settingsStore[i].scope === 'flight' && settingsStore[i].flightId === flightId) {
      settingsStore.splice(i, 1)
    }
  }
  // Remove all flight-level offerings.
  for (let i = offeringsStore.length - 1; i >= 0; i--) {
    if (offeringsStore[i].scope === 'flight' && offeringsStore[i].flightId === flightId) {
      offeringsStore.splice(i, 1)
    }
  }
  // Remove from the exceptions list.
  const i = mockFlightExceptions.findIndex((e) => e.id === flightId)
  if (i >= 0) mockFlightExceptions.splice(i, 1)
}

export function describeRoute(route: RouteSummary): string {
  return `${route.originAirport} → ${route.destinationAirport} (${route.originCity} to ${route.destinationCity})`
}

export function customChips(route: RouteSummary): string {
  return customChipsForRoute(route)
}
