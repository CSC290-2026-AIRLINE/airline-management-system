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
  mapFlightSummary,
  mapOffering,
  mapReportableFlight,
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

export function createOfferingsApi(client: ApiClient): OfferingsApi {
  async function loadRoutes(): Promise<RouteSummary[]> {
    const wire = await client.get<unknown[]>('/api/staff/routes')
    return (wire ?? []).map((r) => mapRoute(r as never))
  }

  async function loadCabinSettings(scope: 'network' | 'route' | 'flight', key: string | null): Promise<CabinSetting[]> {
    const path = scope === 'network' ? '/api/staff/cabin-settings/network' : `/api/staff/cabin-settings/${scope}/${key}`
    const wire = await client.get<unknown[]>(path)
    return (wire ?? []).map((s) => mapCabinSetting(s as never))
  }

  async function loadOfferings(): Promise<ProductOffering[]> {
    const wire = await client.get<unknown[]>('/api/staff/product-offerings')
    return (wire ?? []).map((o) => mapOffering(o as never))
  }

  async function loadRouteOverrides(routeId: string): Promise<CabinSetting[]> {
    const wire = await client.get<unknown[]>(`/api/staff/cabin-settings/route/${routeId}`)
    return (wire ?? []).map((s) => mapCabinSetting(s as never))
  }

  async function loadRouteFlights(
    routeId: string,
  ): Promise<RouteSummary['cabinStatuses'] extends never ? never : import('./mappers').RouteFlight[]> {
    requireId('GET /api/staff/routes/:routeId/flights', 'routeId', routeId)
    const wire = await client.get<unknown[]>(`/api/staff/routes/${routeId}/flights`)
    return (wire ?? []).map((f) => mapRouteFlight(f as never))
  }

  return {
    async getOfferedMenu() {
      try {
        const [netSettings, networkOfferings, allRoutes, offerings, exceptions] = await Promise.all([
          loadCabinSettings('network', null),
          loadOfferings(),
          loadRoutes(),
          loadOfferings(),
          client.get<unknown[]>('/api/staff/flight-reports/reportable-flights'),
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
        // Flight exceptions: derive from the reportable-flights list. The
        // wire doesn't carry per-flight "has flight-scope settings" info,
        // so each reportable flight is a candidate. The page filters
        // client-side; the audit kept the "no fake data" rule here.
        const exceptionRows: FlightException[] = (exceptions ?? []).map((row) => {
          const f = mapReportableFlight(row as never)
          return {
            id: f.id,
            routeId: '', // backend list omits routeId; route-detail page resolves it.
            flightNumber: f.flightNumber,
            scheduledDeparture: f.scheduledDeparture,
            cabin: 'economy' as Cabin,
            changedSettings: [],
          }
        })
        return {
          networkOfferings,
          networkCabinSettings: netSettings,
          routes,
          flightExceptions: exceptionRows,
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
        // TODO: when the F12 backend ships a dedicated
        // /api/staff/flight-exceptions endpoint, replace this with a real
        // call. For now we list every reportable flight as a candidate;
        // the page filters client-side and the "Settings changed" column
        // will be empty until the dedicated endpoint exists.
        const wire = await client.get<unknown[]>('/api/staff/flight-reports/reportable-flights')
        const all: FlightException[] = (wire ?? []).map((row) => {
          const f = mapReportableFlight(row as never)
          return {
            id: f.id,
            routeId: '', // resolved by route-detail page if user opens one.
            flightNumber: f.flightNumber,
            scheduledDeparture: f.scheduledDeparture,
            cabin: 'economy' as Cabin,
            changedSettings: [],
          }
        })
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
        // Use the reportable-flights / route-settings to infer the
        // exception summary for each flight.
        const flightSettings = await loadCabinSettings('flight', routeId).catch(() => [] as CabinSetting[])
        for (const fs of flightSummaries) {
          const summaries: string[] = []
          for (const cabin of ['economy', 'business'] as Cabin[]) {
            const summary = summarizeException(flightSettings, fs.id, cabin)
            if (summary) summaries.push(`${cabin}: ${summary}`)
          }
          fs.hasException = summaries.length > 0
          fs.exceptionSummary = summaries.join(' · ')
        }
        return mapRouteDetail(
          routeSummary ? applyRouteOverrides(routeSummary, allSettings) : null,
          allSettings,
          offerings.filter((o) => o.scope === 'network' || o.routeId === routeId),
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
    async getFlightCabinSettings(flightId) {
      try {
        requireId('GET /api/staff/cabin-settings/flight/:id', 'flightId', flightId)
        const wire = await client.get<unknown[]>(`/api/staff/cabin-settings/flight/${flightId}`)
        return (wire ?? []).map((s) => mapCabinSetting(s as never))
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
        const wire = await client.put<unknown>('/api/staff/product-offerings', toOfferingInput(input))
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
          (await loadOfferings())
            .filter((o) => o.productId === productId && o.cabin === cabin && o.isActive)
            .map((o) => o.routeId ?? '__network__'),
        )
        for (const r of routes) {
          if (existing.has(r.id) || existing.has('__network__')) {
            skipped++
            continue
          }
          await client.put<unknown>(
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
        const all = await loadOfferings()
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
        requireId('GET /api/staff/cabin-settings/flight/:id (for clearing)', 'flightId', flightId)
        const settings = await client.get<unknown[]>(`/api/staff/cabin-settings/flight/${flightId}`)
        for (const s of (settings ?? []) as Array<Record<string, unknown>>) {
          const cabin = String(s.cabin) as Cabin
          await this.resetCabinSettingsToInherited('flight', null, flightId, cabin)
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
