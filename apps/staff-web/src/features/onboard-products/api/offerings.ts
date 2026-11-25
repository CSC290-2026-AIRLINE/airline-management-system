// Offerings + cabin-settings + routes API. Wraps the four F12
// controllers and the new /staff/routes shim. The "route" and "flight
// exception" data come from those endpoints; the page still derives
// per-route meal-service state locally from the cabin settings.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { MealPolicyInvalidError, OfferingsApiError, SettingInvalidError } from './errors'
import {
  applyRouteOverrides,
  mapCabinSetting,
  mapCabinSettingScope,
  mapFlightSummary,
  mapOffering,
  mapRoute,
  mapRouteDetail,
  mapRouteFlight,
  readAffectedOpenOrders,
  toCabinSettingInput,
  toOfferingInput,
  type ReportableFlight,
} from './mappers'
import { MissingIdError, requireId } from './guards'
import type { Cabin, CabinSetting, FlightException, ProductOffering, RouteDetail, RouteFilter, RouteSummary, SettingPatch } from './types'

export interface PutSettingsResult {
  setting: CabinSetting
  affectedOpenOrders: number
}

export interface BulkOfferResult {
  affectedRoutes: number
  skippedRoutes: number
  affectedCabins: number
}

export interface NetworkDefaults {
  cabinSettings: CabinSetting[]
  offerings: ProductOffering[]
}

export interface OfferedMenu {
  networkOfferings: ProductOffering[]
  networkCabinSettings: CabinSetting[]
  routes: RouteSummary[]
  flightExceptions: FlightException[]
}

export interface OfferingsApi {
  getOfferedMenu: () => Promise<OfferedMenu>
  listRoutes: (filter: RouteFilter) => Promise<{ total: number; totalCustomized: number; routes: RouteSummary[] }>
  listFlightExceptions: (filter: { search: string }) => Promise<{ total: number; exceptions: FlightException[] }>
  getRouteDetail: (routeId: string) => Promise<RouteDetail>
  getNetworkDefault: () => Promise<NetworkDefaults>
  listProductOfferings: (filters?: { routeId?: string; cabin?: Cabin }) => Promise<ProductOffering[]>
  // The settings the flight sets for itself (the rows at the flight
  // scope). A cabin without a row of its own is not in the list.
  getFlightCabinSettings: (flightId: string) => Promise<CabinSetting[]>
  putCabinSettings: (
    scope: 'network' | 'route' | 'flight',
    routeId: string | null,
    flightId: string | null,
    cabin: Cabin,
    patch: SettingPatch,
  ) => Promise<PutSettingsResult>
  resetCabinSettingsToInherited: (scope: 'route' | 'flight', routeId: string | null, flightId: string | null, cabin: Cabin) => Promise<void>
  createProductOffering: (input: {
    productId: string
    scope: 'network' | 'route' | 'flight'
    routeId: string | null
    flightId: string | null
    cabin: Cabin
    isDefault: boolean
    isActive: boolean
  }) => Promise<ProductOffering>
  updateProductOffering: (id: string, patch: { isActive?: boolean; isDefault?: boolean }) => Promise<ProductOffering>
  deleteProductOffering: (id: string) => Promise<void>
  bulkOffer: (filter: RouteFilter, productId: string, cabin: Cabin) => Promise<BulkOfferResult>
  bulkWithdraw: (filter: RouteFilter, productId: string, cabin: Cabin) => Promise<BulkOfferResult>
  clearFlightException: (flightId: string) => Promise<void>
}

function rethrow(err: unknown, fallback: OfferingsApiError): never {
  if (err instanceof OfferingsApiError) throw err
  if (err instanceof ApiError) {
    if (err.code === 'SETTING_INVALID') throw new SettingInvalidError(err.message, err.details)
    if (err.code === 'MEAL_POLICY_INVALID') throw new MealPolicyInvalidError(err.message, err.details)
    throw new OfferingsApiError(err.code, err.message, err.status, err.details)
  }
  throw fallback
}

function matchesRouteFilter(r: RouteSummary, filter: RouteFilter): boolean {
  const search = filter.search.trim().toLowerCase()
  if (search) {
    const hay = `${r.originAirport} ${r.destinationAirport} ${r.originCity} ${r.destinationCity}`.toLowerCase()
    if (!hay.includes(search)) return false
  }
  if (filter.cabin !== 'all') {
    if (r.cabinStatuses[filter.cabin].state === 'inherited' && filter.status === 'customized') return false
  }
  if (filter.mealService !== 'all') {
    const service = r.cabinStatuses[filter.cabin === 'all' ? 'economy' : filter.cabin].mealService
    if (service !== filter.mealService) return false
  }
  return true
}

function summarizeException(settings: CabinSetting[], flightId: string, cabin: Cabin): string {
  const row = settings.find((s) => s.scope === 'flight' && s.flightId === flightId && s.cabin === cabin)
  if (!row) return ''
  const bits: string[] = []
  if (row.mealService != null) bits.push('meal service')
  if (row.mealSelection != null) bits.push('meal selection')
  if (row.orderWindowHours != null) bits.push('order window')
  if (row.includedPerPassenger != null) bits.push('included')
  return bits.join(', ')
}

// The fields a flight overrides, in the words the exceptions table
// shows. A null field is "inherit", so it is not a change.
function changedFields(row: CabinSetting): string[] {
  const bits: string[] = []
  if (row.mealService != null) bits.push('meal service')
  if (row.mealSelection != null) bits.push('meal selection')
  if (row.orderWindowHours != null) bits.push('order window')
  if (row.includedPerPassenger != null) bits.push('included')
  if (row.preorderEnabled != null) bits.push('pre-order')
  if (row.premiumMealsAllowed != null) bits.push('premium meals')
  if (row.snacksEnabled != null) bits.push('snacks')
  if (row.dutyFreeEnabled != null) bits.push('duty free')
  if (row.onboardBufferPercent != null) bits.push('onboard buffer')
  return bits
}

export function createOfferingsApi(client: ApiClient): OfferingsApi {
  async function loadRoutes(): Promise<RouteSummary[]> {
    const wire = await client.get<unknown[]>('/api/staff/routes')
    return (wire ?? []).map((r) => mapRoute(r as never))
  }

  async function loadCabinSettings(scope: 'network' | 'route', key: string | null): Promise<CabinSetting[]> {
    // Network and route settings are read through the scope filter; a
    // flight's own settings have their own scope.
    return loadScopeRows(scope, scope === 'route' ? key : null)
  }

  // The scope endpoint answers with one entry per cabin: the effective
  // value of every field and the row that lives at this scope. Only
  // the row is a setting the staff UI reads and edits, so a scope
  // without a row of its own is dropped.
  async function loadScopeRows(scope: 'network' | 'route' | 'flight', scopeId: string | null): Promise<CabinSetting[]> {
    const wire = await client.get<unknown[]>('/api/staff/cabin-settings', {
      scope,
      scopeId: scopeId ?? undefined,
    })
    return (wire ?? []).map((s) => mapCabinSettingScope(s as never)).filter((s): s is CabinSetting => s != null)
  }

  // The settings one flight sets for itself.
  async function loadFlightCabinSettings(flightId: string): Promise<CabinSetting[]> {
    return loadScopeRows('flight', flightId)
  }

  // Every flight that overrides its route with its own settings.
  async function loadAllFlightCabinSettings(): Promise<CabinSetting[]> {
    return loadScopeRows('flight', null)
  }

  async function loadOfferings(filters?: { routeId?: string; cabin?: Cabin }): Promise<ProductOffering[]> {
    const wire = await client.get<unknown[]>('/api/staff/product-offerings', {
      routeId: filters?.routeId,
      cabin: filters?.cabin,
    })
    return (wire ?? []).map((o) => mapOffering(o as never))
  }

  async function loadRouteOverrides(routeId: string): Promise<CabinSetting[]> {
    return loadCabinSettings('route', routeId)
  }

  async function loadRouteFlights(
    routeId: string,
  ): Promise<RouteSummary['cabinStatuses'] extends never ? never : import('./mappers').RouteFlight[]> {
    requireId('GET /api/staff/routes/:routeId/flights', 'routeId', routeId)
    const wire = await client.get<unknown[]>(`/api/staff/routes/${routeId}/flights`)
    return (wire ?? []).map((f) => mapRouteFlight(f as never))
  }

  // The single-flight exceptions: the flights that override their
  // route, with their own cabin settings or their own offerings. The
  // backend has no list route for them, so they are read from the
  // scope endpoints and the route's flights.
  async function loadFlightExceptions(): Promise<FlightException[]> {
    const [routes, flightSettings, offerings] = await Promise.all([loadRoutes(), loadAllFlightCabinSettings(), loadOfferings()])
    const rows: FlightException[] = []
    for (const route of routes) {
      const flights = await loadRouteFlights(route.id)
      for (const flight of flights) {
        const settings = flightSettings.filter((s) => s.flightId === flight.id)
        const flightOfferings = offerings.filter((o) => o.scope === 'flight' && o.flightId === flight.id)
        const routeLabel = `${route.originAirport} → ${route.destinationAirport}`
        for (const setting of settings) {
          rows.push({
            id: flight.id,
            routeId: route.id,
            flightNumber: flight.flightNumber,
            scheduledDeparture: flight.scheduledDeparture,
            cabin: setting.cabin,
            changedSettings: changedFields(setting),
            route: routeLabel,
          })
        }
        // A flight can also override the menu only.
        if (settings.length === 0 && flightOfferings.length > 0) {
          rows.push({
            id: flight.id,
            routeId: route.id,
            flightNumber: flight.flightNumber,
            scheduledDeparture: flight.scheduledDeparture,
            cabin: flightOfferings[0].cabin,
            changedSettings: ['menu'],
            route: routeLabel,
          })
        }
      }
    }
    return rows
  }

  return {
    async getOfferedMenu() {
      try {
        const [netSettings, networkOfferings, allRoutes, offerings, exceptions] = await Promise.all([
          loadCabinSettings('network', null),
          loadOfferings(),
          loadRoutes(),
          loadOfferings(),
          loadFlightExceptions(),
        ])
        // Mark routes customized where the network+route settings disagree
        // (any route-level row → custom). We need the route-scoped settings
        // to be certain; loadCabinSettings('network') only gives us the
        // network defaults. For the menu page's quick view we mark
        // customized iff a route-level offering exists.
        const routeOfferings = new Set(offerings.filter((o) => o.scope === 'route').map((o) => `${o.routeId}:${o.cabin}`))
        const routes: RouteSummary[] = allRoutes.map((r) => {
          const withStatus: RouteSummary = { ...r, cabinStatuses: { ...r.cabinStatuses } as RouteSummary['cabinStatuses'] }
          for (const cabin of Object.keys(withStatus.cabinStatuses) as Cabin[]) {
            const customized = routeOfferings.has(`${r.id}:${cabin}`)
            const net = netSettings.find((s) => s.scope === 'network' && s.cabin === cabin)
            withStatus.cabinStatuses[cabin] = {
              state: customized ? 'custom' : 'inherited',
              mealService: (net?.mealService ?? 'paid') as 'paid' | 'complimentary' | 'none',
            }
          }
          return withStatus
        })
        return {
          networkOfferings,
          networkCabinSettings: netSettings,
          routes,
          flightExceptions: exceptions,
        }
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not load the offered menu.', 0))
      }
    },
    async listRoutes(filter) {
      try {
        const [all, settings, offerings] = await Promise.all([loadRoutes(), loadCabinSettings('network', null), loadOfferings()])
        // For each route, build a summary with cabin statuses from the
        // (network + route) cabin settings + any route-level offerings.
        const byRoute = new Map<string, CabinSetting[]>()
        for (const s of settings) {
          if (s.scope === 'route' && s.routeId) {
            const arr = byRoute.get(s.routeId) ?? []
            arr.push(s)
            byRoute.set(s.routeId, arr)
          }
        }
        const customOfferings = new Set(offerings.filter((o) => o.scope === 'route').map((o) => `${o.routeId}:${o.cabin}`))
        const summaries = all.map((r) => {
          const overrides = byRoute.get(r.id) ?? []
          const withOverrides = applyRouteOverrides(r, [...settings, ...overrides])
          // Apply offering-custom flag too.
          for (const cabin of Object.keys(withOverrides.cabinStatuses) as Cabin[]) {
            if (customOfferings.has(`${r.id}:${cabin}`)) {
              withOverrides.cabinStatuses[cabin] = { ...withOverrides.cabinStatuses[cabin], state: 'custom' }
            }
          }
          return withOverrides
        })
        const filtered = summaries.filter((r) => matchesRouteFilter(r, filter))
        const total = summaries.length
        const totalCustomized = summaries.filter((r) => Object.values(r.cabinStatuses).some((c) => c.state === 'custom')).length
        const statusFiltered =
          filter.status === 'customized'
            ? filtered.filter((r) => Object.values(r.cabinStatuses).some((c) => c.state === 'custom'))
            : filter.status === 'inherited'
              ? filtered.filter((r) => Object.values(r.cabinStatuses).every((c) => c.state === 'inherited'))
              : filtered
        return { total, totalCustomized, routes: statusFiltered }
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not load routes.', 0))
      }
    },
    async listFlightExceptions(filter) {
      try {
        const all = await loadFlightExceptions()
        const search = filter.search.trim().toLowerCase()
        const exceptions = search ? all.filter((e) => e.flightNumber.toLowerCase().includes(search)) : all
        return { total: exceptions.length, exceptions }
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not load flight exceptions.', 0))
      }
    },
    async getRouteDetail(routeId) {
      try {
        requireId('GET /api/staff/routes/:routeId', 'routeId', routeId)
        const [route, routeSettings, netSettings, offerings, flights] = await Promise.all([
          client.get<unknown>(`/api/staff/routes/${routeId}`).catch(() => null),
          loadRouteOverrides(routeId),
          loadCabinSettings('network', null),
          loadOfferings(),
          loadRouteFlights(routeId).catch((err: unknown) => {
            if (err instanceof MissingIdError) return []
            throw err
          }),
        ])
        const allSettings = [...netSettings, ...routeSettings]
        const routeSummary = route ? mapRoute(route as never) : null
        // Map RouteFlight → FlightSummary for the route detail payload.
        const flightSummaries = flights.map((f): import('./types').FlightSummary => ({
          id: f.id,
          flightNumber: f.flightNumber,
          routeId: f.routeId,
          scheduledDeparture: f.scheduledDeparture,
          departureAirport: '',
          arrivalAirport: '',
          hasException: false,
          exceptionSummary: '',
        }))
        // The flight-scope rows of every flight on the route: they are
        // what makes a flight an exception.
        const flightSettings = (
          await Promise.all(flightSummaries.map((f) => loadFlightCabinSettings(f.id).catch(() => [] as CabinSetting[])))
        ).flat()
        for (const fs of flightSummaries) {
          const summaries: string[] = []
          for (const cabin of ['economy', 'business'] as Cabin[]) {
            const summary = summarizeException(flightSettings, fs.id, cabin)
            if (summary) summaries.push(`${cabin}: ${summary}`)
          }
          fs.hasException = summaries.length > 0
          fs.exceptionSummary = summaries.join(' · ')
        }
        const flightIds = new Set(flightSummaries.map((f) => f.id))
        return mapRouteDetail(
          routeSummary ? applyRouteOverrides(routeSummary, allSettings) : null,
          [...allSettings, ...flightSettings],
          // The menu of the route, plus the menu of its own flights:
          // a flight can override the menu only.
          offerings.filter(
            (o) =>
              o.scope === 'network' || o.routeId === routeId || (o.scope === 'flight' && o.flightId != null && flightIds.has(o.flightId)),
          ),
          flightSummaries,
        )
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new OfferingsApiError('NOT_FOUND', 'Route not found.', 0))
        }
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not load the route.', 0))
      }
    },
    async getNetworkDefault() {
      try {
        const [settings, offerings] = await Promise.all([loadCabinSettings('network', null), loadOfferings()])
        return { cabinSettings: settings.filter((s) => s.scope === 'network'), offerings: offerings.filter((o) => o.scope === 'network') }
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not load the network default.', 0))
      }
    },
    async listProductOfferings(filters) {
      try {
        return await loadOfferings(filters)
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not load the offerings.', 0))
      }
    },
    async getFlightCabinSettings(flightId) {
      try {
        requireId('GET /api/staff/cabin-settings?scope=flight', 'flightId', flightId)
        return await loadFlightCabinSettings(flightId)
      } catch (err) {
        if (err instanceof MissingIdError) return []
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not load the flight settings.', 0))
      }
    },
    async putCabinSettings(scope, routeId, flightId, cabin, patch) {
      try {
        const wire = await client.put<unknown>('/api/staff/cabin-settings', toCabinSettingInput({ scope, routeId, flightId, cabin, patch }))
        return { setting: mapCabinSetting(wire as never), affectedOpenOrders: readAffectedOpenOrders(wire) }
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not save the settings.', 0))
      }
    },
    async resetCabinSettingsToInherited(scope, routeId, flightId, cabin) {
      // "Reset to inherited" = upsert a fully-null row. The backend treats
      // a null value on a route/flight scope as "inherit from next level".
      const nullPatch: Record<string, unknown> = {
        mealService: null,
        mealSelection: null,
        includedPerPassenger: null,
        preorderEnabled: null,
        orderWindowHours: null,
        premiumMealsAllowed: null,
        snacksEnabled: null,
        dutyFreeEnabled: null,
        onboardBufferPercent: null,
      }
      try {
        await client.put<unknown>('/api/staff/cabin-settings', toCabinSettingInput({ scope, routeId, flightId, cabin, patch: nullPatch }))
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not reset the settings.', 0))
      }
    },
    async createProductOffering(input) {
      try {
        const wire = await client.post<unknown>('/api/staff/product-offerings', toOfferingInput(input))
        return mapOffering(wire as never)
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not add the offering.', 0))
      }
    },
    async updateProductOffering(id, patch) {
      try {
        requireId('PUT /api/staff/product-offerings/:id', 'id', id)
        const wire = await client.put<unknown>(`/api/staff/product-offerings/${id}`, patch)
        return mapOffering(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new OfferingsApiError('NOT_FOUND', 'Offering not found.', 0))
        }
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not update the offering.', 0))
      }
    },
    async deleteProductOffering(id) {
      try {
        requireId('DELETE /api/staff/product-offerings/:id', 'id', id)
        await client.delete(`/api/staff/product-offerings/${id}`)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new OfferingsApiError('NOT_FOUND', 'Offering not found.', 0))
        }
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not remove the offering.', 0))
      }
    },
    async bulkOffer(filter, productId, cabin) {
      try {
        const { routes } = await this.listRoutes(filter)
        let added = 0
        let skipped = 0
        const existing = new Set(
          (await loadOfferings({ cabin }))
            .filter((o) => o.productId === productId && o.cabin === cabin && o.isActive)
            .map((o) => o.routeId ?? '__network__'),
        )
        for (const r of routes) {
          if (existing.has(r.id) || existing.has('__network__')) {
            skipped++
            continue
          }
          await client.post<unknown>(
            '/api/staff/product-offerings',
            toOfferingInput({
              productId,
              scope: 'route',
              routeId: r.id,
              flightId: null,
              cabin,
              isDefault: false,
              isActive: true,
            }),
          )
          added++
        }
        return { affectedRoutes: added, skippedRoutes: skipped, affectedCabins: added }
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Bulk offer failed.', 0))
      }
    },
    async bulkWithdraw(filter, productId, cabin) {
      try {
        const { routes } = await this.listRoutes(filter)
        const routeIds = new Set(routes.map((r) => r.id))
        const all = await loadOfferings({ cabin })
        const targets = all.filter(
          (o) => o.productId === productId && o.cabin === cabin && o.scope === 'route' && o.routeId && routeIds.has(o.routeId),
        )
        for (const o of targets) {
          await client.delete(`/api/staff/product-offerings/${o.id}`)
        }
        return { affectedRoutes: targets.length, skippedRoutes: routes.length - targets.length, affectedCabins: targets.length }
      } catch (err) {
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Bulk withdraw failed.', 0))
      }
    },
    async clearFlightException(flightId) {
      // Drop all flight-scope cabin settings + offerings for this flight.
      try {
        requireId('GET /api/staff/cabin-settings?scope=flight', 'flightId', flightId)
        const settings = await loadFlightCabinSettings(flightId)
        for (const s of settings) {
          await this.resetCabinSettingsToInherited('flight', null, flightId, s.cabin)
        }
        // No direct /product-offerings?flight= filter; this is a best-effort
        // cleanup that works for the demo's handful of flights.
        const offerings = await loadOfferings()
        for (const o of offerings) {
          if (o.scope === 'flight' && o.flightId === flightId) {
            await client.delete(`/api/staff/product-offerings/${o.id}`)
          }
        }
      } catch (err) {
        if (err instanceof MissingIdError) return
        rethrow(err, new OfferingsApiError('UNKNOWN', 'Could not clear the exception.', 0))
      }
    },
  }
}

export { OfferingsApiError, SettingInvalidError, MealPolicyInvalidError, mapFlightSummary }
export type { ReportableFlight }

export function useOfferingsApi(): OfferingsApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => createOfferingsApi(new ApiClient(fetchWithAuth as ApiFetch)), [fetchWithAuth])
}
