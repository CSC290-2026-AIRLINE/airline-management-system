import type { DbService } from '@backend/db/db.service'
import { LoyaltyDataService } from './loyalty-data.service'
import type { UpgradeOutcome } from './loyalty-seat.port'
import { LoyaltyUpgradeService } from './loyalty-upgrade.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-09T05:00:00Z')

const RULES = [
  { code: 'silver', name: 'Silver', rank: 1, min_miles: 15000, min_flights: 20, valid_months: 12 },
  { code: 'gold', name: 'Gold', rank: 2, min_miles: 40000, min_flights: 50, valid_months: 12 },
  { code: 'platinum', name: 'Platinum', rank: 3, min_miles: 80000, min_flights: 100, valid_months: 12 },
]
const benefit = (tier_code: string, upgrade_eligible: boolean) => ({
  tier_code,
  lounge_guests: null,
  extra_baggage_kg: { toString: () => '0' },
  priority_checkin: false,
  priority_boarding: false,
  upgrade_eligible,
  insurance_price: null,
})

const candidate = (coupon_id: string, tier_code: string, confirmed: string, over: Record<string, unknown> = {}) => ({
  coupon_id,
  flight_id: 'flight-1',
  from_cabin: 'economy',
  confirmed_at: new Date(confirmed),
  member_id: `mem-${coupon_id}`,
  customer_id: `cust-${coupon_id}`,
  tier_code,
  flight_number: 'FY 308',
  service_date: new Date('2026-11-09T00:00:00Z'),
  first_name: 'Anna',
  last_name: 'Lee',
  ...over,
})

function makeSvc(outcomes: UpgradeOutcome[] = []) {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    loyalty_tier_rule: { findMany: jest.fn().mockResolvedValue(RULES) },
    loyalty_tier_benefit: {
      findMany: jest.fn().mockResolvedValue([benefit('silver', true), benefit('gold', true), benefit('platinum', false)]),
    },
    seat_inventory: {
      findMany: jest.fn().mockResolvedValue([
        { flight_id: 'flight-1', cabin: 'economy' },
        { flight_id: 'flight-1', cabin: 'business' },
      ]),
    },
    loyalty_benefit_use: { create: jest.fn().mockResolvedValue({ id: 'use-1' }) },
    inbound_event: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))
  const port = { upgradeCoupon: jest.fn() }
  for (const o of outcomes) port.upgradeCoupon.mockResolvedValueOnce(o)
  port.upgradeCoupon.mockResolvedValue('no_seat')
  const dbService = db as unknown as DbService
  const svc = new LoyaltyUpgradeService(dbService, new LoyaltyDataService(dbService), port)
  return { svc, db, port }
}

describe('LoyaltyUpgradeService', () => {
  it('upgrades higher tiers first, then the earliest booking, until the cabin is full', async () => {
    const { svc, db, port } = makeSvc(['upgraded', 'upgraded'])
    db.$queryRaw.mockResolvedValueOnce([
      candidate('silver-early', 'silver', '2026-10-01T00:00:00Z'),
      candidate('gold-late', 'gold', '2026-10-20T00:00:00Z'),
      candidate('gold-early', 'gold', '2026-10-05T00:00:00Z'),
    ])

    const counts = await svc.run(NOW)

    expect(port.upgradeCoupon.mock.calls.map(([, id, to]) => [id, to])).toEqual([
      ['gold-early', 'business'],
      ['gold-late', 'business'],
      ['silver-early', 'business'],
    ])
    expect(counts).toEqual({ candidates: 3, upgraded: 2, noSeat: 1, skipped: 0 })
    expect(db.loyalty_benefit_use.create).toHaveBeenCalledWith({
      data: {
        member_id: 'mem-gold-early',
        benefit_type: 'upgrade',
        booking_coupon_id: 'gold-early',
        flight_id: 'flight-1',
        from_cabin: 'economy',
        to_cabin: 'business',
        used_at: NOW,
      },
      select: { id: true },
    })
    expect(db.inbound_event.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            source: '11',
            source_event_id: 'cabin_upgraded:gold-early',
            event_type: 'cabin_upgraded',
            payload: expect.objectContaining({ tier_name: 'Gold', to_cabin: 'Business', service_date: '2026-11-09' }),
          }),
        ],
        skipDuplicates: true,
      }),
    )
  })

  it('skips tiers whose benefits do not include upgrades', async () => {
    const { svc, db, port } = makeSvc(['upgraded'])
    db.$queryRaw.mockResolvedValueOnce([candidate('plat', 'platinum', '2026-10-01T00:00:00Z')])
    expect(await svc.run(NOW)).toMatchObject({ candidates: 0, upgraded: 0 })
    expect(port.upgradeCoupon).not.toHaveBeenCalled()
  })

  it('skips a coupon already in the best cabin, and one the seat move refuses', async () => {
    const { svc, db } = makeSvc(['not_upgradable'])
    db.$queryRaw.mockResolvedValueOnce([
      candidate('top', 'gold', '2026-10-01T00:00:00Z', { from_cabin: 'business' }),
      candidate('shared', 'gold', '2026-10-01T00:00:00Z'),
    ])
    expect(await svc.run(NOW)).toMatchObject({ upgraded: 0, skipped: 2 })
    expect(db.loyalty_benefit_use.create).not.toHaveBeenCalled()
  })

  it('treats a coupon a concurrent run already upgraded as skipped', async () => {
    const { svc, db } = makeSvc(['upgraded'])
    db.$queryRaw.mockResolvedValueOnce([candidate('c1', 'gold', '2026-10-01T00:00:00Z')])
    db.loyalty_benefit_use.create.mockRejectedValueOnce({ code: 'P2002' })
    expect(await svc.run(NOW)).toMatchObject({ upgraded: 0, skipped: 1 })
  })
})
