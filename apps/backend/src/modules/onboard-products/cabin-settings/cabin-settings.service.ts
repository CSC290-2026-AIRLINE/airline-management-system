// CabinSettingsService: upserts per-scope rows, reads scope rows for
// the UI, and resolves a single cabin's effective value using the
// flight → route → network precedence rule. Pure resolution helpers
// (resolveCabinSetting, shortestOrderWindowHours) live in common/
// so they can be unit-tested without booting Nest.

import { Injectable } from '@nestjs/common'
import type { Prisma } from '../../../db/generated/prisma/client'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import {
  resolveCabinSetting,
  resolveCabinSettingWithSources,
  shortestOrderWindowHours,
  type CabinSettingRow,
  type CabinSettingSource,
  type F12Cabin,
  type F12OfferingScope,
  type ResolvedCabinSetting,
} from '../common/mapping'

export interface CabinSettingDto {
  id: string
  scope: F12OfferingScope
  routeId: string | null
  flightId: string | null
  cabin: F12Cabin
  mealService: string | null
  mealSelection: string | null
  includedPerPassenger: number | null
  preorderEnabled: boolean | null
  orderWindowHours: number | null
  premiumMealsAllowed: boolean | null
  snacksEnabled: boolean | null
  dutyFreeEnabled: boolean | null
  onboardBufferPercent: number | null
}

export interface CabinSettingInput {
  scope: F12OfferingScope
  routeId?: string | null
  flightId?: string | null
  cabin: F12Cabin
  mealService?: 'complimentary' | 'paid' | 'none' | null
  mealSelection?: 'choose' | 'fixed' | null
  includedPerPassenger?: number | null
  preorderEnabled?: boolean | null
  orderWindowHours?: number | null
  premiumMealsAllowed?: boolean | null
  snacksEnabled?: boolean | null
  dutyFreeEnabled?: boolean | null
  onboardBufferPercent?: number | null
}

// One effective value and the scope it was inherited from.
export interface CabinSettingValueDto {
  value: ResolvedCabinSetting[keyof ResolvedCabinSetting]
  source: CabinSettingSource
}

// The settings at one scope, per cabin.
export interface CabinSettingScopeDto {
  scope: F12OfferingScope
  scopeId: string | null
  cabin: F12Cabin
  values: Record<keyof ResolvedCabinSetting, CabinSettingValueDto>
  // The row that lives at this scope, when there is one.
  row: CabinSettingDto | null
}

@Injectable()
export class CabinSettingsService {
  constructor(private readonly db: DbService) {}

  async listByScope(scope: F12OfferingScope, parentId?: string): Promise<CabinSettingDto[]> {
    const where: Record<string, unknown> = { scope }
    if (parentId) {
      if (scope === 'route') where.route_id = parentId
      if (scope === 'flight') where.flight_id = parentId
    }
    const rows = await this.db.cabin_setting.findMany({ where })
    return rows.map(this.toDto)
  }

  // The settings at a scope, with the effective value of every field
  // and the scope it was inherited from. The staff UI shows this so a
  // value that comes from a wider scope is visible as such.
  async listAtScope(scope: F12OfferingScope, scopeId: string | null, cabin?: F12Cabin): Promise<CabinSettingScopeDto[]> {
    if (scope === 'flight' && !scopeId) {
      // Without a scopeId the flight scope lists every flight that
      // overrides its route. The staff UI reads this for the
      // single-flight exceptions table.
      return this.listFlightScopes(cabin)
    }
    if (scope !== 'network' && !scopeId) {
      throw new ApiErrorException('SETTING_INVALID', `scopeId is required when scope=${scope}.`, 400)
    }
    let routeId: string | null = null
    let flightId: string | null = null
    if (scope === 'flight') {
      const flight = await this.db.flight.findUnique({ where: { id: scopeId! } })
      if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
      routeId = flight.route_id
      flightId = flight.id
    } else if (scope === 'route') {
      routeId = scopeId
    }

    const rows = await this.db.cabin_setting.findMany({
      where: {
        OR: [
          { scope: 'network' },
          ...(routeId ? [{ scope: 'route', route_id: routeId }] : []),
          ...(flightId ? [{ scope: 'flight', flight_id: flightId }] : []),
        ],
      },
    })
    const mapped: CabinSettingRow[] = rows.map((r) => this.toRow(r))

    const cabins: F12Cabin[] = cabin ? [cabin] : ['economy', 'premium_economy', 'business']
    const out: CabinSettingScopeDto[] = []
    for (const c of cabins) {
      const candidates: CabinSettingRow[] = []
      if (scope === 'flight') {
        const flightRow = mapped.find((r) => r.scope === 'flight' && r.flightId === flightId && r.cabin === c)
        if (flightRow) candidates.push(flightRow)
      }
      if (scope === 'flight' || scope === 'route') {
        const routeRow = mapped.find((r) => r.scope === 'route' && r.routeId === routeId && r.cabin === c)
        if (routeRow) candidates.push(routeRow)
      }
      const networkRow = mapped.find((r) => r.scope === 'network' && r.cabin === c)
      if (networkRow) candidates.push(networkRow)

      const resolved = resolveCabinSettingWithSources(candidates)
      const values = {} as Record<keyof ResolvedCabinSetting, CabinSettingValueDto>
      for (const key of Object.keys(resolved.values) as (keyof ResolvedCabinSetting)[]) {
        values[key] = { value: resolved.values[key], source: resolved.sources[key] }
      }
      const own = rows.find((r) => {
        if (r.scope !== scope || r.cabin !== c) return false
        if (scope === 'network') return r.route_id === null && r.flight_id === null
        if (scope === 'route') return r.route_id === scopeId
        return r.flight_id === scopeId
      })
      out.push({
        scope,
        scopeId: scope === 'network' ? null : scopeId,
        cabin: c,
        values,
        row: own ? this.toDto(own) : null,
      })
    }
    return out
  }

  async upsert(input: CabinSettingInput, staffId: string): Promise<CabinSettingDto & { openOrderCount: number }> {
    if (input.scope === 'route' && !input.routeId) {
      throw new ApiErrorException('SETTING_INVALID', 'routeId is required when scope=route.', 400)
    }
    if (input.scope === 'flight' && !input.flightId) {
      throw new ApiErrorException('SETTING_INVALID', 'flightId is required when scope=flight.', 400)
    }
    if (input.onboardBufferPercent != null && (input.onboardBufferPercent < 0 || input.onboardBufferPercent > 100)) {
      throw new ApiErrorException('SETTING_INVALID', 'onboardBufferPercent must be 0-100.', 400)
    }
    if (input.orderWindowHours != null && (input.orderWindowHours < 0 || input.orderWindowHours > 168)) {
      throw new ApiErrorException('SETTING_INVALID', 'orderWindowHours must be 0-168.', 400)
    }
    const existing = await this.db.cabin_setting.findFirst({
      where: {
        route_id: input.scope === 'route' ? (input.routeId ?? null) : null,
        flight_id: input.scope === 'flight' ? (input.flightId ?? null) : null,
        cabin: input.cabin,
      },
    })
    // For the network scope every setting column is required (the
    // cabin_setting_check1 constraint refuses nulls there), so an
    // update of a network row must preserve the existing values
    // when the caller did not pass them. Route/flight scopes are
    // genuinely partial, so null is a legal "inherit" sentinel.
    const data = existing ? this.buildPatch(input, staffId, existing) : this.buildCreate(input, staffId)
    const row = existing
      ? await this.db.cabin_setting.update({ where: { id: existing.id }, data })
      : await this.db.cabin_setting.create({ data })
    // The staff UI shows how many open orders the change affects.
    const openOrderCount = await this.countOpenOrders(input)
    return { ...this.toDto(row), openOrderCount }
  }

  // The open customer orders on the flights this setting covers.
  private async countOpenOrders(input: CabinSettingInput): Promise<number> {
    const where: Record<string, unknown> = { status: { in: ['pending_payment', 'confirmed'] } }
    if (input.scope === 'flight') {
      where.flight_id = input.flightId
    } else if (input.scope === 'route' && input.routeId) {
      const flights = await this.db.flight.findMany({ where: { route_id: input.routeId }, select: { id: true } })
      where.flight_id = { in: flights.map((f) => f.id) }
    }
    return this.db.product_order.count({ where })
  }

  // For the create path we still honour the "only set what was
  // passed" rule, but every key must be present in the object so the
  // network-scope nullability check passes.
  private buildCreate(input: CabinSettingInput, staffId: string): Prisma.cabin_settingUncheckedCreateInput {
    return {
      scope: input.scope,
      route_id: input.scope === 'route' ? (input.routeId ?? null) : null,
      flight_id: input.scope === 'flight' ? (input.flightId ?? null) : null,
      cabin: input.cabin,
      meal_service: this.coalesceForCreate(input.scope, input.mealService, 'complimentary'),
      meal_selection: this.coalesceForCreate(input.scope, input.mealSelection, 'choose'),
      included_per_passenger: this.coalesceForCreate(input.scope, input.includedPerPassenger, 0),
      preorder_enabled: this.coalesceForCreate(input.scope, input.preorderEnabled, false),
      order_window_hours: this.coalesceForCreate(input.scope, input.orderWindowHours, 48),
      premium_meals_allowed: this.coalesceForCreate(input.scope, input.premiumMealsAllowed, false),
      snacks_enabled: this.coalesceForCreate(input.scope, input.snacksEnabled, true),
      duty_free_enabled: this.coalesceForCreate(input.scope, input.dutyFreeEnabled, true),
      onboard_buffer_percent: this.coalesceForCreate(input.scope, input.onboardBufferPercent, 10),
      updated_by_staff_id: staffId,
    }
  }

  private coalesceForCreate<T>(scope: string, value: T | null | undefined, fallback: T): T | null {
    if (scope !== 'network') return value ?? null
    return value ?? fallback
  }

  // For the patch path only the keys explicitly passed by the caller
  // are written; the others keep their current value. This keeps the
  // network-scope NOT NULL constraint satisfied.
  private buildPatch(
    input: CabinSettingInput,
    staffId: string,
    existing: {
      meal_service: string | null
      meal_selection: string | null
      included_per_passenger: number | null
      preorder_enabled: boolean | null
      order_window_hours: number | null
      premium_meals_allowed: boolean | null
      snacks_enabled: boolean | null
      duty_free_enabled: boolean | null
      onboard_buffer_percent: number | null
    },
    // Prisma's strict create vs update input unions make typing this
    // a distraction; the keys we set are valid in both directions.
  ): any {
    const data: Record<string, unknown> = { updated_by_staff_id: staffId }
    if (input.mealService !== undefined) data.meal_service = input.mealService
    else if (input.scope === 'network') data.meal_service = existing.meal_service ?? 'complimentary'
    if (input.mealSelection !== undefined) data.meal_selection = input.mealSelection
    else if (input.scope === 'network') data.meal_selection = existing.meal_selection ?? 'choose'
    if (input.includedPerPassenger !== undefined) data.included_per_passenger = input.includedPerPassenger
    else if (input.scope === 'network') data.included_per_passenger = existing.included_per_passenger ?? 0
    if (input.preorderEnabled !== undefined) data.preorder_enabled = input.preorderEnabled
    else if (input.scope === 'network') data.preorder_enabled = existing.preorder_enabled ?? false
    if (input.orderWindowHours !== undefined) data.order_window_hours = input.orderWindowHours
    else if (input.scope === 'network') data.order_window_hours = existing.order_window_hours ?? 48
    if (input.premiumMealsAllowed !== undefined) data.premium_meals_allowed = input.premiumMealsAllowed
    else if (input.scope === 'network') data.premium_meals_allowed = existing.premium_meals_allowed ?? false
    if (input.snacksEnabled !== undefined) data.snacks_enabled = input.snacksEnabled
    else if (input.scope === 'network') data.snacks_enabled = existing.snacks_enabled ?? true
    if (input.dutyFreeEnabled !== undefined) data.duty_free_enabled = input.dutyFreeEnabled
    else if (input.scope === 'network') data.duty_free_enabled = existing.duty_free_enabled ?? true
    if (input.onboardBufferPercent !== undefined) data.onboard_buffer_percent = input.onboardBufferPercent
    else if (input.scope === 'network') data.onboard_buffer_percent = existing.onboard_buffer_percent ?? 10
    return data
  }

  // Resolves a single cabin for a single flight. Reads every
  // relevant row from the DB (network + this flight's route + this
  // flight) and applies the precedence rule in pure code.
  async resolveForFlight(flightId: string, cabin: F12Cabin): Promise<ResolvedCabinSetting> {
    const flight = await this.db.flight.findUnique({ where: { id: flightId } })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    const rows = await this.db.cabin_setting.findMany({
      where: {
        cabin,
        OR: [{ scope: 'network' }, { scope: 'route', route_id: flight.route_id }, { scope: 'flight', flight_id: flightId }],
      },
    })
    const mapped: CabinSettingRow[] = rows.map((r) => this.toRow(r))
    return resolveCabinSetting(mapped, { cabin, routeId: flight.route_id, flightId })
  }

  // Returns the resolved settings for every cabin on a flight, used
  // by the catering-orders service to generate the order lines.
  async resolveAllForFlight(flightId: string): Promise<Record<F12Cabin, ResolvedCabinSetting>> {
    const flight = await this.db.flight.findUnique({ where: { id: flightId } })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    const rows = await this.db.cabin_setting.findMany({
      where: {
        OR: [{ scope: 'network' }, { scope: 'route', route_id: flight.route_id }, { scope: 'flight', flight_id: flightId }],
      },
    })
    const cabins: F12Cabin[] = ['economy', 'premium_economy', 'business']
    const out = {} as Record<F12Cabin, ResolvedCabinSetting>
    for (const cabin of cabins) {
      const mapped: CabinSettingRow[] = rows
        .filter((r) => r.cabin === cabin)
        .map((r) => ({
          scope: r.scope as F12OfferingScope,
          routeId: r.route_id,
          flightId: r.flight_id,
          cabin: r.cabin as F12Cabin,
          mealService: (r.meal_service as ResolvedCabinSetting['mealService'] | null) ?? null,
          mealSelection: (r.meal_selection as ResolvedCabinSetting['mealSelection'] | null) ?? null,
          includedPerPassenger: r.included_per_passenger,
          preorderEnabled: r.preorder_enabled,
          orderWindowHours: r.order_window_hours,
          premiumMealsAllowed: r.premium_meals_allowed,
          snacksEnabled: r.snacks_enabled,
          dutyFreeEnabled: r.duty_free_enabled,
          onboardBufferPercent: r.onboard_buffer_percent,
        }))
      out[cabin] = resolveCabinSetting(mapped, { cabin, routeId: flight.route_id, flightId })
    }
    return out
  }

  // Shortest pre-order window across the flight's effective settings
  // (in hours). Used to compute the catering-order cutoff.
  async orderWindowHoursForFlight(flightId: string): Promise<number> {
    const resolved = await this.resolveAllForFlight(flightId)
    const all = Object.values(resolved).map((r): CabinSettingRow => ({
      scope: 'flight',
      routeId: null,
      flightId: null,
      cabin: 'economy',
      mealService: r.mealService,
      mealSelection: r.mealSelection,
      includedPerPassenger: r.includedPerPassenger,
      preorderEnabled: r.preorderEnabled,
      orderWindowHours: r.orderWindowHours,
      premiumMealsAllowed: r.premiumMealsAllowed,
      snacksEnabled: r.snacksEnabled,
      dutyFreeEnabled: r.dutyFreeEnabled,
      onboardBufferPercent: r.onboardBufferPercent,
    }))
    return shortestOrderWindowHours(all)
  }

  // Every flight that overrides its route, with the effective value
  // of each field and the row that lives on the flight. The staff UI
  // reads this for the single-flight exceptions table.
  private async listFlightScopes(cabin?: F12Cabin): Promise<CabinSettingScopeDto[]> {
    const flightRows = await this.db.cabin_setting.findMany({
      where: { scope: 'flight', ...(cabin ? { cabin } : {}) },
    })
    if (flightRows.length === 0) return []
    const flightIds = [...new Set(flightRows.map((r) => r.flight_id).filter((id): id is string => id != null))]
    const flights = await this.db.flight.findMany({ where: { id: { in: flightIds } }, select: { id: true, route_id: true } })
    const routeByFlight = new Map(flights.map((f) => [f.id, f.route_id]))
    const routeIds = [...new Set(flights.map((f) => f.route_id))]
    const rows = await this.db.cabin_setting.findMany({
      where: {
        OR: [{ scope: 'network' }, { scope: 'route', route_id: { in: routeIds } }, { scope: 'flight', flight_id: { in: flightIds } }],
      },
    })
    const mapped: CabinSettingRow[] = rows.map((r) => this.toRow(r))
    const cabins: F12Cabin[] = cabin ? [cabin] : ['economy', 'premium_economy', 'business']
    const out: CabinSettingScopeDto[] = []
    for (const flightId of flightIds) {
      const routeId = routeByFlight.get(flightId) ?? null
      for (const c of cabins) {
        const candidates: CabinSettingRow[] = []
        const flightRow = mapped.find((r) => r.scope === 'flight' && r.flightId === flightId && r.cabin === c)
        if (flightRow) candidates.push(flightRow)
        const routeRow = mapped.find((r) => r.scope === 'route' && r.routeId === routeId && r.cabin === c)
        if (routeRow) candidates.push(routeRow)
        const networkRow = mapped.find((r) => r.scope === 'network' && r.cabin === c)
        if (networkRow) candidates.push(networkRow)

        const resolved = resolveCabinSettingWithSources(candidates)
        const values = {} as Record<keyof ResolvedCabinSetting, CabinSettingValueDto>
        for (const key of Object.keys(resolved.values) as (keyof ResolvedCabinSetting)[]) {
          values[key] = { value: resolved.values[key], source: resolved.sources[key] }
        }
        const own = rows.find((r) => r.scope === 'flight' && r.flight_id === flightId && r.cabin === c)
        out.push({
          scope: 'flight',
          scopeId: flightId,
          cabin: c,
          values,
          row: own ? this.toDto(own) : null,
        })
      }
    }
    return out
  }

  private toRow = (r: {
    scope: string
    route_id: string | null
    flight_id: string | null
    cabin: string
    meal_service: string | null
    meal_selection: string | null
    included_per_passenger: number | null
    preorder_enabled: boolean | null
    order_window_hours: number | null
    premium_meals_allowed: boolean | null
    snacks_enabled: boolean | null
    duty_free_enabled: boolean | null
    onboard_buffer_percent: number | null
  }): CabinSettingRow => ({
    scope: r.scope as F12OfferingScope,
    routeId: r.route_id,
    flightId: r.flight_id,
    cabin: r.cabin as F12Cabin,
    mealService: (r.meal_service as ResolvedCabinSetting['mealService'] | null) ?? null,
    mealSelection: (r.meal_selection as ResolvedCabinSetting['mealSelection'] | null) ?? null,
    includedPerPassenger: r.included_per_passenger,
    preorderEnabled: r.preorder_enabled,
    orderWindowHours: r.order_window_hours,
    premiumMealsAllowed: r.premium_meals_allowed,
    snacksEnabled: r.snacks_enabled,
    dutyFreeEnabled: r.duty_free_enabled,
    onboardBufferPercent: r.onboard_buffer_percent,
  })

  private toDto = (row: {
    id: string
    scope: string
    route_id: string | null
    flight_id: string | null
    cabin: string
    meal_service: string | null
    meal_selection: string | null
    included_per_passenger: number | null
    preorder_enabled: boolean | null
    order_window_hours: number | null
    premium_meals_allowed: boolean | null
    snacks_enabled: boolean | null
    duty_free_enabled: boolean | null
    onboard_buffer_percent: number | null
  }): CabinSettingDto => ({
    id: row.id,
    scope: row.scope as F12OfferingScope,
    routeId: row.route_id,
    flightId: row.flight_id,
    cabin: row.cabin as F12Cabin,
    mealService: row.meal_service,
    mealSelection: row.meal_selection,
    includedPerPassenger: row.included_per_passenger,
    preorderEnabled: row.preorder_enabled,
    orderWindowHours: row.order_window_hours,
    premiumMealsAllowed: row.premium_meals_allowed,
    snacksEnabled: row.snacks_enabled,
    dutyFreeEnabled: row.duty_free_enabled,
    onboardBufferPercent: row.onboard_buffer_percent,
  })
}
