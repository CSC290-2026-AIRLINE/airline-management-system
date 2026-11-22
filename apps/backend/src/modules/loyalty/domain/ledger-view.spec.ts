import { CouponFlight, filterStatement, StatementSource, statementLines } from './ledger-view'

const coupon = (over: Partial<CouponFlight> = {}): CouponFlight => ({
  origin: 'BKK',
  destination: 'NRT',
  flightNumber: 'FY308',
  cabin: 'economy',
  fareClassName: 'Discount',
  passengerName: 'Anna Lee',
  flownBySelf: true,
  ...over,
})

const row = (r: Partial<StatementSource> & Pick<StatementSource, 'id' | 'seq' | 'type' | 'miles' | 'balanceAfter'>): StatementSource => ({
  occurredAt: new Date('2026-01-10T00:00:00Z'),
  expiresAt: null,
  expiredTransactionId: null,
  reversedTransactionId: null,
  distanceKm: null,
  multiplier: null,
  reason: null,
  coupon: null,
  expiredFrom: null,
  ...r,
})

const now = new Date('2026-11-08T00:00:00Z')

describe('statementLines', () => {
  const rows: StatementSource[] = [
    row({
      id: 'e1',
      seq: 1,
      type: 'earn',
      miles: 2300,
      balanceAfter: 2300,
      distanceKm: 4600,
      multiplier: '0.50',
      coupon: coupon(),
      expiresAt: new Date('2026-11-20T00:00:00Z'),
    }),
    row({
      id: 'e2',
      seq: 2,
      type: 'earn',
      miles: 4600,
      balanceAfter: 6900,
      distanceKm: 4600,
      multiplier: '1.00',
      coupon: coupon({ passengerName: 'Ben Lee', flownBySelf: false, fareClassName: 'Flex' }),
      expiresAt: new Date('2029-01-10T00:00:00Z'),
    }),
    row({ id: 'r1', seq: 3, type: 'redeem', miles: -1000, balanceAfter: 5900, coupon: coupon({ cabin: 'premium_economy' }) }),
    row({
      id: 'a1',
      seq: 4,
      type: 'adjust',
      miles: 500,
      balanceAfter: 6400,
      reason: 'Diverted flight',
      expiresAt: new Date('2029-11-08T00:00:00Z'),
    }),
  ]
  const lines = statementLines(rows, now, 30)

  it('lists newest first with the balance after each row', () => {
    expect(lines.map((l) => [l.seq, l.balanceAfter])).toEqual([
      [4, 6400],
      [3, 5900],
      [2, 6900],
      [1, 2300],
    ])
  })

  it('describes an earn on the member’s own seat and on a companion’s', () => {
    const own = lines.find((l) => l.seq === 1)
    expect(own).toMatchObject({ title: 'BKK → NRT · FY308 · your seat', detail: 'Discount × 0.50 · 4,600 km', bookedForOther: false })
    expect(lines.find((l) => l.seq === 2)).toMatchObject({ title: "BKK → NRT · FY308 · Ben Lee's seat", bookedForOther: true })
  })

  it('notes what is left of each credit after redemptions, earliest expiry first', () => {
    expect(lines.find((l) => l.seq === 1)).toMatchObject({ expiryNote: '1,300 left · expire 20 Nov 2026', expiringSoon: true })
    expect(lines.find((l) => l.seq === 2)).toMatchObject({ expiryNote: 'Expires 10 Jan 2029', expiringSoon: false })
  })

  it('describes redemptions and adjustments', () => {
    expect(lines.find((l) => l.seq === 3)).toMatchObject({ title: 'BKK → NRT · FY308 · award seat', expiryNote: null })
    expect(lines.find((l) => l.seq === 3)?.detail).toBe('Premium Economy award seat for Anna Lee')
    expect(lines.find((l) => l.seq === 4)).toMatchObject({ title: 'Miles added by Flython', detail: 'Diverted flight' })
  })

  it('filters by type and date range', () => {
    expect(filterStatement(lines, { type: 'earn' }).map((l) => l.seq)).toEqual([2, 1])
    expect(filterStatement(lines, { from: new Date('2026-02-01T00:00:00Z') })).toEqual([])
  })
})
