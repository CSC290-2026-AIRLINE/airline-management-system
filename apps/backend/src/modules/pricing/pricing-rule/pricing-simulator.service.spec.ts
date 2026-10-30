import { BadRequestException, UnprocessableEntityException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { PromoCodeService } from '../promo-code/promo-code.service'
import type { SeatFeeService } from '../seat-fee/seat-fee.service'
import type { SettingService } from '../setting/setting.service'
import type { TaxFeeService } from '../tax-fee/tax-fee.service'
import type { SimulatePriceDto } from './dto/simulate-price.dto'
import { PricingRuleService } from './pricing-rule.service'
import { PricingSimulatorService } from './pricing-simulator.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const rule = (id: string, group: string, name: string, priority: number, conditions: object, pct: number) => ({
  id,
  rule_group: group,
  name,
  priority,
  min_days_out: null,
  max_days_out: null,
  min_seats_left_pct: null,
  max_seats_left_pct: null,
  month: null,
  start_date: null,
  end_date: null,
  fare_class_id: null,
  adjustment_pct: String(pct),
  is_active: true,
  ...conditions,
})

const RULES = [
  rule('h7', 'urgency', 'H-7', 1, { min_days_out: 4, max_days_out: 7 }, 10),
  rule('load', 'load', 'Under 20% left', 1, { max_seats_left_pct: '20' }, 15),
]
const TAXES = [
  { name: 'Airport tax', calc_type: 'pct', value: '7.00' },
  { name: 'Fuel surcharge', calc_type: 'flat', value: '5.00' },
]
const dto: SimulatePriceDto = { base_fare: 100, departure_date: '2026-10-13', seats_left_pct: 15, seat_type: 'normal' }

describe('PricingSimulatorService', () => {
  const db = { pricing_rule: { findMany: jest.fn() } }
  const seatFees = { findAll: jest.fn() }
  const taxFees = { findAll: jest.fn() }
  const settings = { getBaseCurrency: jest.fn(), getQuoteHoldMinutes: jest.fn() }
  const promoCodes = { checkPromo: jest.fn() }
  let service: PricingSimulatorService

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-06T06:00:00.000Z') })
    db.pricing_rule.findMany.mockResolvedValue(RULES)
    seatFees.findAll.mockResolvedValue([])
    taxFees.findAll.mockResolvedValue(TAXES)
    settings.getBaseCurrency.mockResolvedValue('USD')
    settings.getQuoteHoldMinutes.mockResolvedValue(15)
    service = new PricingSimulatorService(
      new PricingRuleService(db as unknown as DbService),
      seatFees as unknown as SeatFeeService,
      taxFees as unknown as TaxFeeService,
      settings as unknown as SettingService,
      promoCodes as unknown as PromoCodeService,
    )
  })

  afterEach(() => jest.useRealTimers())

  it("gives the design's worked example: 100 becomes 140.36", async () => {
    const result = await service.simulate(dto)

    expect(result.lines).toEqual([
      { label: 'Base fare', amount: 100 },
      { label: 'H-7 (urgency)', detail: '+10%', amount: 10 },
      { label: 'Under 20% left (load)', detail: '+15%', amount: 16.5 },
      { label: 'Airport tax', detail: '7%', amount: 8.86 },
      { label: 'Fuel surcharge', detail: 'flat', amount: 5 },
    ])
    expect(result.total).toBe(140.36)
    expect(result).toMatchObject({
      today: '2026-10-06',
      days_to_departure: 7,
      currency: 'USD',
      unmatched_groups: ['month', 'period'],
      quote_hold_minutes: 15,
    })
  })

  it('adds the economy seat fee before tax, ignoring other cabins', async () => {
    seatFees.findAll.mockResolvedValue([
      { cabin: 'business', seat_type: 'exit_row', amount: '99.00' },
      { cabin: 'economy', seat_type: 'exit_row', amount: '12.00' },
    ])

    const result = await service.simulate({ ...dto, seat_type: 'exit_row' })

    expect(result.lines).toContainEqual({ label: 'Exit row', detail: 'flat', amount: 12 })
    expect(result.lines).toContainEqual({ label: 'Airport tax', detail: '7%', amount: 9.7 }) // 7% of 138.50
    expect(result.total).toBe(153.2)
  })

  it('shows no seat line for a free seat', async () => {
    seatFees.findAll.mockResolvedValue([{ cabin: 'economy', seat_type: 'normal', amount: '0.00' }])

    const result = await service.simulate(dto)

    expect(result.lines.map((line) => line.label)).not.toContain('Normal seat')
  })

  it('skips class-specific rules, as no fare class is chosen', async () => {
    await service.simulate(dto)

    expect(db.pricing_rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{ fare_class_id: null }, { fare_class_id: null }] }) }),
    )
  })

  it('takes a percentage promo off before tax', async () => {
    promoCodes.checkPromo.mockResolvedValue({ id: 'p1', code: 'SPRING15', discount_pct: '15.00', discount_amount: null })

    const result = await service.simulate({ ...dto, promo_code: 'SPRING15' })

    expect(promoCodes.checkPromo).toHaveBeenCalledWith('SPRING15', expect.any(Date))
    expect(result.lines).toContainEqual({ label: 'Promo SPRING15', detail: '15%', amount: -18.98 })
    expect(result.total).toBe(120.05)
  })

  it('takes a fixed promo off before tax', async () => {
    promoCodes.checkPromo.mockResolvedValue({ id: 'p2', code: 'MINUS20', discount_pct: null, discount_amount: '20.00' })

    const result = await service.simulate({ ...dto, promo_code: 'MINUS20' })

    expect(result.lines).toContainEqual({ label: 'Promo MINUS20', detail: 'flat', amount: -20 })
  })

  it('passes on the refusal for a promo that cannot be used', async () => {
    promoCodes.checkPromo.mockRejectedValue(new UnprocessableEntityException())

    await expect(service.simulate({ ...dto, promo_code: 'OLD' })).rejects.toBeInstanceOf(UnprocessableEntityException)
  })

  it('leaves the promo check out when no code is sent', async () => {
    promoCodes.checkPromo.mockClear()

    await service.simulate(dto)

    expect(promoCodes.checkPromo).not.toHaveBeenCalled()
  })

  it('refuses a departure in the past', async () => {
    await expect(service.simulate({ ...dto, departure_date: '2026-10-05' })).rejects.toBeInstanceOf(BadRequestException)
  })
})
