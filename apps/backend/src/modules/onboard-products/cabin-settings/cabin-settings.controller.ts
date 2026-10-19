// CabinSettings HTTP surface under /api/staff/cabin-settings.
// Supports upserting at any scope (network/route/flight) and
// resolving the effective values for a single flight.

import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffAuth } from '../common/staff-auth.decorator'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { CabinSettingsService, type CabinSettingInput } from './cabin-settings.service'

const ALLOWED_CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
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
    throw new ApiErrorException('SETTING_INVALID', 'cabin must be one of economy, premium_economy, business, first.', 400)
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

  @Get('network')
  async network() {
    return this.settings.listByScope('network')
  }

  @Get('route/:routeId')
  async route(@Param('routeId') routeId: string) {
    return this.settings.listByScope('route', routeId)
  }

  @Get('flight/:flightId')
  async flight(@Param('flightId') flightId: string) {
    return this.settings.listByScope('flight', flightId)
  }

  @Get('resolve/:flightId')
  async resolve(@Param('flightId') flightId: string) {
    const cabins = ['economy', 'premium_economy', 'business', 'first'] as const
    const out: Record<string, unknown> = {}
    for (const cabin of cabins) {
      out[cabin] = await this.settings.resolveForFlight(flightId, cabin)
    }
    return out
  }

  // Spec: PUT only. Use POST as the alias so the staff-web can hit a
  // dedicated upsert route. (Same shape; same response.)
  @Put()
  @Post()
  async upsert(@Body() body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.settings.upsert(parseInput(body), staff.id)
  }
}
