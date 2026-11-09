// CabinSettings HTTP surface under /api/staff/cabin-settings.
//
//   GET /staff/cabin-settings?scope=&scopeId=&cabin=
//        the settings at a scope (network, route or flight), with the
//        effective value of every field and the scope it is inherited
//        from. scope=flight without a scopeId lists every flight that
//        overrides its route;
//   PUT /staff/cabin-settings
//        set or clear the settings for a scope and cabin; the response
//        carries the number of open orders the change affects.
//
// The per-flight view (the resolved settings of every cabin on one
// flight) is in the flights controller.

import { Body, Controller, Get, Put, Query } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffAuth } from '../common/staff-auth.decorator'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { CabinSettingsService, type CabinSettingInput } from './cabin-settings.service'

const ALLOWED_CABINS = ['economy', 'premium_economy', 'business'] as const
const ALLOWED_SCOPES = ['network', 'route', 'flight'] as const
const ALLOWED_MEAL_SERVICE = ['complimentary', 'paid', 'none'] as const
const ALLOWED_MEAL_SELECTION = ['choose', 'fixed'] as const

function parseInput(body: unknown): CabinSettingInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('SETTING_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (!(ALLOWED_SCOPES as readonly string[]).includes(b.scope as string)) {
    throw new ApiErrorException('SETTING_INVALID', 'scope must be network, route or flight.', 400)
  }
  if (!(ALLOWED_CABINS as readonly string[]).includes(b.cabin as string)) {
    throw new ApiErrorException('SETTING_INVALID', 'cabin must be one of economy, premium_economy, business.', 400)
  }
  if (b.scope === 'route' && typeof b.routeId !== 'string') {
    throw new ApiErrorException('SETTING_INVALID', 'routeId is required when scope=route.', 400)
  }
  if (b.scope === 'flight' && typeof b.flightId !== 'string') {
    throw new ApiErrorException('SETTING_INVALID', 'flightId is required when scope=flight.', 400)
  }
  const out: CabinSettingInput = {
    scope: b.scope as CabinSettingInput['scope'],
    cabin: b.cabin as CabinSettingInput['cabin'],
    routeId: b.scope === 'route' ? (b.routeId as string) : null,
    flightId: b.scope === 'flight' ? (b.flightId as string) : null,
  }
  if (b.mealService !== undefined) {
    if (b.mealService !== null && !(ALLOWED_MEAL_SERVICE as readonly string[]).includes(b.mealService as string)) {
      throw new ApiErrorException('SETTING_INVALID', 'mealService must be complimentary, paid or none.', 400)
    }
    out.mealService = b.mealService as CabinSettingInput['mealService']
  }
  if (b.mealSelection !== undefined) {
    if (b.mealSelection !== null && !(ALLOWED_MEAL_SELECTION as readonly string[]).includes(b.mealSelection as string)) {
      throw new ApiErrorException('SETTING_INVALID', 'mealSelection must be choose or fixed.', 400)
    }
    out.mealSelection = b.mealSelection as CabinSettingInput['mealSelection']
  }
  if (b.includedPerPassenger !== undefined) {
    if (b.includedPerPassenger !== null && (typeof b.includedPerPassenger !== 'number' || b.includedPerPassenger < 0)) {
      throw new ApiErrorException('SETTING_INVALID', 'includedPerPassenger must be a non-negative number or null.', 400)
    }
    out.includedPerPassenger = b.includedPerPassenger
  }
  if (b.preorderEnabled !== undefined) {
    if (b.preorderEnabled !== null && typeof b.preorderEnabled !== 'boolean') {
      throw new ApiErrorException('SETTING_INVALID', 'preorderEnabled must be a boolean or null.', 400)
    }
    out.preorderEnabled = b.preorderEnabled
  }
  if (b.orderWindowHours !== undefined) {
    if (b.orderWindowHours !== null && (typeof b.orderWindowHours !== 'number' || b.orderWindowHours < 0)) {
      throw new ApiErrorException('SETTING_INVALID', 'orderWindowHours must be a non-negative number or null.', 400)
    }
    out.orderWindowHours = b.orderWindowHours
  }
  if (b.premiumMealsAllowed !== undefined) {
    if (b.premiumMealsAllowed !== null && typeof b.premiumMealsAllowed !== 'boolean') {
      throw new ApiErrorException('SETTING_INVALID', 'premiumMealsAllowed must be a boolean or null.', 400)
    }
    out.premiumMealsAllowed = b.premiumMealsAllowed
  }
  if (b.snacksEnabled !== undefined) {
    if (b.snacksEnabled !== null && typeof b.snacksEnabled !== 'boolean') {
      throw new ApiErrorException('SETTING_INVALID', 'snacksEnabled must be a boolean or null.', 400)
    }
    out.snacksEnabled = b.snacksEnabled
  }
  if (b.dutyFreeEnabled !== undefined) {
    if (b.dutyFreeEnabled !== null && typeof b.dutyFreeEnabled !== 'boolean') {
      throw new ApiErrorException('SETTING_INVALID', 'dutyFreeEnabled must be a boolean or null.', 400)
    }
    out.dutyFreeEnabled = b.dutyFreeEnabled
  }
  if (b.onboardBufferPercent !== undefined) {
    if (
      b.onboardBufferPercent !== null &&
      (typeof b.onboardBufferPercent !== 'number' || b.onboardBufferPercent < 0 || b.onboardBufferPercent > 100)
    ) {
      throw new ApiErrorException('SETTING_INVALID', 'onboardBufferPercent must be 0-100 or null.', 400)
    }
    out.onboardBufferPercent = b.onboardBufferPercent
  }
  return out
}

@Controller('staff/cabin-settings')
@StaffAuth()
export class CabinSettingsController {
  constructor(private readonly settings: CabinSettingsService) {}

  @Get()
  async list(@Query('scope') scope?: string, @Query('scopeId') scopeId?: string, @Query('cabin') cabin?: string) {
    const scopeValue = scope ?? 'network'
    if (!(ALLOWED_SCOPES as readonly string[]).includes(scopeValue)) {
      throw new ApiErrorException('SETTING_INVALID', 'scope must be network, route or flight.', 400)
    }
    if (cabin && !(ALLOWED_CABINS as readonly string[]).includes(cabin)) {
      throw new ApiErrorException('SETTING_INVALID', 'cabin must be one of economy, premium_economy, business.', 400)
    }
    return this.settings.listAtScope(
      scopeValue as CabinSettingInput['scope'],
      scopeId ?? null,
      cabin as CabinSettingInput['cabin'] | undefined,
    )
  }

  @Put()
  async upsert(@Body() body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.settings.upsert(parseInput(body), staff.id)
  }
}
