import { allocateCredits, draftExpiries, expiryReminders, reminderEventId } from './expiry'
import { LedgerRow } from './types'

const row = (r: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'type' | 'miles'>): LedgerRow => ({
  occurredAt: new Date('2024-01-01T00:00:00Z'),
  expiresAt: null,
  expiredTransactionId: null,
  reversedTransactionId: null,
  ...r,
})
const jan = new Date('2027-01-10T00:00:00Z')
const mar = new Date('2027-03-10T00:00:00Z')

describe('allocateCredits', () => {
  it('uses the earliest-expiring credits first, counting live redeems and negative adjustments', () => {
    const credits = allocateCredits([
      row({ id: 'e2', type: 'earn', miles: 1000, expiresAt: mar }),
      row({ id: 'e1', type: 'earn', miles: 1000, expiresAt: jan }),
      row({ id: 'r1', type: 'redeem', miles: -800 }),
      row({ id: 'a1', type: 'adjust', miles: -500 }),
    ])
    expect(credits.map((c) => [c.transactionId, c.remaining])).toEqual([
      ['e1', 0],
      ['e2', 700],
    ])
  })

  it('ignores reversed redeems and counts earlier expiries against their credit', () => {
    const credits = allocateCredits([
      row({ id: 'e1', type: 'earn', miles: 1000, expiresAt: jan }),
      row({ id: 'p1', type: 'adjust', miles: 300, expiresAt: mar }),
      row({ id: 'r1', type: 'redeem', miles: -800 }),
      row({ id: 'rr1', type: 'redeem_reversal', miles: 800, reversedTransactionId: 'r1' }),
      row({ id: 'x1', type: 'expire', miles: -400, expiredTransactionId: 'e1' }),
    ])
    expect(credits.map((c) => c.remaining)).toEqual([600, 300])
  })
})

describe('draftExpiries', () => {
  it('expires exactly what is left of each credit past its date', () => {
    const rows = [
      row({ id: 'e1', type: 'earn', miles: 1000, expiresAt: jan }),
      row({ id: 'e2', type: 'earn', miles: 1000, expiresAt: mar }),
      row({ id: 'r1', type: 'redeem', miles: -400 }),
    ]
    expect(draftExpiries(rows, new Date('2027-02-01T00:00:00Z'))).toEqual([{ expiredTransactionId: 'e1', miles: -600 }])
  })

  it('is idempotent once the expire row is written', () => {
    const rows = [
      row({ id: 'e1', type: 'earn', miles: 1000, expiresAt: jan }),
      row({ id: 'r1', type: 'redeem', miles: -400 }),
      row({ id: 'x1', type: 'expire', miles: -600, expiredTransactionId: 'e1' }),
    ]
    expect(draftExpiries(rows, new Date('2027-02-01T00:00:00Z'))).toEqual([])
  })

  it('does not expire again after a later redeem that the earlier run already accounted for', () => {
    const rows = [
      row({ id: 'e1', type: 'earn', miles: 1000, expiresAt: jan }),
      row({ id: 'e2', type: 'earn', miles: 1000, expiresAt: mar }),
      row({ id: 'r1', type: 'redeem', miles: -400 }),
      row({ id: 'x1', type: 'expire', miles: -600, expiredTransactionId: 'e1' }),
      row({ id: 'r2', type: 'redeem', miles: -300 }),
    ]
    expect(draftExpiries(rows, new Date('2027-04-01T00:00:00Z'))).toEqual([{ expiredTransactionId: 'e2', miles: -700 }])
  })
})

describe('expiryReminders', () => {
  it('sends one total per expiry date inside the window', () => {
    const day = new Date('2027-01-10T00:00:00Z')
    const rows = [
      row({ id: 'e1', type: 'earn', miles: 500, expiresAt: day }),
      row({ id: 'e2', type: 'earn', miles: 700, expiresAt: day }),
      row({ id: 'e3', type: 'earn', miles: 900, expiresAt: mar }), // outside 30 days
      row({ id: 'r1', type: 'redeem', miles: -200 }),
    ]
    expect(expiryReminders(rows, new Date('2026-12-20T00:00:00Z'), 30)).toEqual([{ expiresOn: '2027-01-10', miles: 1000 }])
    expect(reminderEventId('m1', '2027-01-10')).toBe('miles_expiring:m1:2027-01-10')
  })
})
