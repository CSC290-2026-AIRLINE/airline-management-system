// CabinSettingsService: upserts per-scope rows, reads scope rows for
// the UI, and resolves a single cabin's effective value using the
// flight → route → network precedence rule. Pure resolution helpers
// (resolveCabinSetting, shortestOrderWindowHours) live in common/
// so they can be unit-tested without booting Nest.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import {
  resolveCabinSetting,
  shortestOrderWindowHours,
  type F12Cabin,
  type F12OfferingScope,
  type ResolvedCabinSetting,
} from '../common/mapping'
import type { CabinSettingRow } from '../common/mapping'

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

  async upsert(input: CabinSettingInput, staffId: string): Promise<CabinSettingDto> {
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
    const data = {
      scope: input.scope,
      route_id: input.scope === 'route' ? (input.routeId ?? null) : null,
      flight_id: input.scope === 'flight' ? (input.flightId ?? null) : null,
      cabin: input.cabin,
      meal_service: input.mealService ?? null,
      meal_selection: input.mealSelection ?? null,
      included_per_passenger: input.includedPerPassenger ?? null,
      preorder_enabled: input.preorderEnabled ?? null,
      order_window_hours: input.orderWindowHours ?? null,
      premium_meals_allowed: input.premiumMealsAllowed ?? null,
      snacks_enabled: input.snacksEnabled ?? null,
      duty_free_enabled: input.dutyFreeEnabled ?? null,
      onboard_buffer_percent: input.onboardBufferPercent ?? null,
      updated_by_staff_id: staffId,
    }
    const row = existing
      ? await this.db.cabin_setting.update({ where: { id: existing.id }, data })
      : await this.db.cabin_setting.create({ data })
    return this.toDto(row)
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
    const mapped: CabinSettingRow[] = rows.map((r) => ({
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
    const cabins: F12Cabin[] = ['economy', 'premium_economy', 'business', 'first']
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
