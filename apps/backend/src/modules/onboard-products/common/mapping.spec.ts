// Pure-function tests for the cabin-settings resolution and the
// flight-report completion rules. These rules are codified in the
// F12 spec and have to be exact, so the tests live next to the
// implementation and run without booting Nest or Prisma.

import { applyCompletionRule, resolveCabinSetting, shortestOrderWindowHours, type CabinSettingRow } from './mapping'

const NETWORK: CabinSettingRow = {
  scope: 'network',
  routeId: null,
  flightId: null,
  cabin: 'economy',
  mealService: 'complimentary',
  mealSelection: 'fixed',
  includedPerPassenger: 1,
  preorderEnabled: false,
  orderWindowHours: 48,
  premiumMealsAllowed: false,
  snacksEnabled: true,
  dutyFreeEnabled: false,
  onboardBufferPercent: 10,
}

describe('resolveCabinSetting', () => {
  it('returns network defaults when no rows match', () => {
    const out = resolveCabinSetting([], { cabin: 'economy' })
    expect(out.mealService).toBe('complimentary')
    expect(out.includedPerPassenger).toBe(1)
    expect(out.onboardBufferPercent).toBe(10)
  })

  it('uses the most specific (flight > route > network) row per column', () => {
    const out = resolveCabinSetting(
      [
        NETWORK,
        {
          scope: 'route',
          flightId: null,
          cabin: 'economy',
          routeId: 'r1',
          mealService: 'paid',
          mealSelection: null,
          includedPerPassenger: null,
          preorderEnabled: null,
          orderWindowHours: 24,
          premiumMealsAllowed: null,
          snacksEnabled: null,
          dutyFreeEnabled: true,
          onboardBufferPercent: null,
        },
        {
          scope: 'flight',
          cabin: 'economy',
          flightId: 'f1',
          routeId: null,
          mealService: null,
          mealSelection: 'choose',
          includedPerPassenger: 2,
          preorderEnabled: null,
          orderWindowHours: null,
          premiumMealsAllowed: null,
          snacksEnabled: null,
          dutyFreeEnabled: null,
          onboardBufferPercent: 15,
        },
      ],
      { cabin: 'economy', routeId: 'r1', flightId: 'f1' },
    )
    expect(out.mealService).toBe('paid') // route override
    expect(out.mealSelection).toBe('choose') // flight override
    expect(out.includedPerPassenger).toBe(2) // flight override
    expect(out.orderWindowHours).toBe(24) // route override
    expect(out.dutyFreeEnabled).toBe(true) // route override
    expect(out.onboardBufferPercent).toBe(15) // flight override
    expect(out.snacksEnabled).toBe(true) // network
  })

  it('inherits NULL values from the next level up', () => {
    const out = resolveCabinSetting(
      [
        NETWORK,
        {
          scope: 'flight',
          cabin: 'business',
          flightId: 'f1',
          routeId: null,
          mealService: 'paid',
          mealSelection: null,
          includedPerPassenger: null,
          preorderEnabled: null,
          orderWindowHours: null,
          premiumMealsAllowed: null,
          snacksEnabled: null,
          dutyFreeEnabled: null,
          onboardBufferPercent: null,
        },
      ],
      { cabin: 'business', routeId: 'r1', flightId: 'f1' },
    )
    expect(out.mealService).toBe('paid') // flight
    expect(out.includedPerPassenger).toBe(1) // network default
    expect(out.orderWindowHours).toBe(48) // network default
  })
})

describe('shortestOrderWindowHours', () => {
  it('returns 48 (default) when no rows have a value', () => {
    expect(shortestOrderWindowHours([])).toBe(48)
  })

  it('returns the minimum positive value across rows', () => {
    expect(
      shortestOrderWindowHours([
        { ...NETWORK, orderWindowHours: 48 },
        { ...NETWORK, orderWindowHours: 24 },
        { ...NETWORK, orderWindowHours: 72 },
      ]),
    ).toBe(24)
  })

  it('ignores zero and null', () => {
    expect(
      shortestOrderWindowHours([
        { ...NETWORK, orderWindowHours: 0 },
        { ...NETWORK, orderWindowHours: null },
        { ...NETWORK, orderWindowHours: 12 },
      ]),
    ).toBe(12)
  })
})

describe('applyCompletionRule', () => {
  it('discards every unit of a meal', () => {
    const r = applyCompletionRule({ category: 'meal', totalOnAircraft: 40, hasValidBatch: true })
    expect(r.discardQty).toBe(40)
    expect(r.afterLabel).toBe('discarded')
  })

  it('keeps a snack while a valid batch remains', () => {
    const r = applyCompletionRule({ category: 'snack', totalOnAircraft: 30, hasValidBatch: true })
    expect(r.discardQty).toBe(0)
    expect(r.afterLabel).toBe('carried')
  })

  it('discards a snack when the only batch is invalid', () => {
    const r = applyCompletionRule({ category: 'snack', totalOnAircraft: 30, hasValidBatch: false })
    expect(r.discardQty).toBe(30)
    expect(r.afterLabel).toBe('discarded')
  })

  it('keeps a beverage while a valid batch remains', () => {
    const r = applyCompletionRule({ category: 'beverage', totalOnAircraft: 20, hasValidBatch: true })
    expect(r.discardQty).toBe(0)
    expect(r.afterLabel).toBe('kept')
  })

  it('discards a beverage when only invalid batches remain', () => {
    const r = applyCompletionRule({ category: 'beverage', totalOnAircraft: 20, hasValidBatch: false })
    expect(r.discardQty).toBe(20)
    expect(r.afterLabel).toBe('discarded')
  })

  it('keeps duty-free while a valid batch remains', () => {
    const r = applyCompletionRule({ category: 'duty_free', totalOnAircraft: 5, hasValidBatch: true })
    expect(r.discardQty).toBe(0)
    expect(r.afterLabel).toBe('kept')
  })

  it('returns zero when the aircraft is empty', () => {
    const r = applyCompletionRule({ category: 'meal', totalOnAircraft: 0, hasValidBatch: true })
    expect(r.discardQty).toBe(0)
  })
})
