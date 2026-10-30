import type { BenefitUse, LoyaltyApi, MemberSummary, RedemptionRow, StatementRow, TierInfo } from './types'

// In-memory stand-in for the Feature 11 API until booking_coupon (feature 3) and the loyalty tables exist.
// The demo member and figures match the Feature 11 Figma screens (Anya Saranpat, Silver), so the pages show the designed states.

const TIERS: TierInfo[] = [
  {
    code: 'silver',
    name: 'Silver',
    rank: 1,
    minMiles: 15000,
    minFlights: 20,
    validMonths: 12,
    benefits: {
      loungeGuests: 0,
      bonusBaggageKg: 5,
      priorityCheckIn: false,
      priorityBoarding: false,
      complimentaryUpgrade: true,
      insurance: { kind: 'member_price', priceThb: 190 },
    },
  },
  {
    code: 'gold',
    name: 'Gold',
    rank: 2,
    minMiles: 40000,
    minFlights: 50,
    validMonths: 12,
    benefits: {
      loungeGuests: 1,
      bonusBaggageKg: 10,
      priorityCheckIn: true,
      priorityBoarding: true,
      complimentaryUpgrade: true,
      insurance: { kind: 'included' },
    },
  },
  {
    code: 'platinum',
    name: 'Platinum',
    rank: 3,
    minMiles: 80000,
    minFlights: 100,
    validMonths: 12,
    benefits: {
      loungeGuests: 2,
      bonusBaggageKg: 20,
      priorityCheckIn: true,
      priorityBoarding: true,
      complimentaryUpgrade: true,
      insurance: { kind: 'included' },
    },
  },
]

type DemoRow = Omit<StatementRow, 'seq' | 'balanceAfter'>

const flight = (occurredAt: string, title: string, detail: string, miles: number, expiryNote: string | null): DemoRow => ({
  type: 'earn',
  miles,
  occurredAt,
  title,
  detail,
  expiryNote,
})

// Oldest first; balanceAfter follows the ledger trigger.
const DEMO_LEDGER: DemoRow[] = [
  flight('2023-08-14T09:00:00Z', 'BKK → CNX · FY 120', 'Discount × 0.50 · 583 km', 292, 'Expired 14 Aug 2026'),
  flight('2023-11-02T09:00:00Z', 'BKK → NRT · FY 601', 'Business × 1.50 · 4,600 km', 6900, 'Used for the FY 815 award seat'),
  flight('2023-11-06T09:00:00Z', 'NRT → BKK · FY 602', 'Business × 1.50 · 4,600 km', 6900, '5,800 left · expire 6 Nov 2026'),
  flight('2026-02-14T09:00:00Z', 'BKK → HKG · FY 811', 'Full fare × 1.00 · 1,722 km', 1722, 'Expires 14 Feb 2029'),
  flight('2026-02-18T09:00:00Z', 'HKG → BKK · FY 812', 'Full fare × 1.00 · 1,722 km', 1722, 'Expires 18 Feb 2029'),
  flight('2026-03-09T09:00:00Z', 'BKK → NRT · FY 601', 'Business × 1.50 · 4,600 km', 6900, 'Expires 9 Mar 2029'),
  flight('2026-03-16T09:00:00Z', 'NRT → BKK · FY 602', 'Business × 1.50 · 4,600 km', 6900, 'Expires 16 Mar 2029'),
  flight('2026-05-11T09:00:00Z', 'BKK → SIN · FY 401', 'Full fare × 1.00 · 1,431 km', 1431, 'Expires 11 May 2029'),
  flight('2026-05-14T09:00:00Z', 'SIN → BKK · FY 402', 'Discount × 0.50 · 1,431 km', 716, 'Expires 14 May 2029'),
  flight('2026-08-02T09:00:00Z', 'BKK → CNX · FY 120', 'Discount × 0.50 · 583 km', 292, 'Expires 2 Aug 2029'),
  flight('2026-08-05T09:00:00Z', 'CNX → BKK · FY 121', 'Discount × 0.50 · 583 km', 292, 'Expires 5 Aug 2029'),
  {
    type: 'expire',
    miles: -292,
    occurredAt: '2026-08-14T00:00:00Z',
    title: 'Miles expired',
    detail: 'From BKK → CNX · FY 120 on 14 Aug 2023',
    expiryNote: null,
  },
  {
    type: 'redeem',
    miles: -8000,
    occurredAt: '2026-09-19T10:00:00Z',
    title: 'Award seat · BKK → HKG · FY 815',
    detail: 'Economy · 12 Dec 2026',
    expiryNote: null,
  },
  {
    type: 'redeem',
    miles: -7500,
    occurredAt: '2026-10-03T08:00:00Z',
    title: 'Award seat · BKK → SIN · FY 405',
    detail: 'Economy · 19 Oct 2026',
    expiryNote: null,
  },
  {
    type: 'redeem_reversal',
    miles: 7500,
    occurredAt: '2026-10-03T09:00:00Z',
    title: 'Miles returned',
    detail: 'Hold on FY 405 ended before payment',
    expiryNote: null,
  },
  {
    type: 'adjust',
    miles: 500,
    occurredAt: '2026-10-11T09:00:00Z',
    title: 'Service recovery',
    detail: 'Staff adjustment · delayed bag case',
    expiryNote: 'Expires 11 Oct 2029',
  },
  flight('2026-10-12T09:00:00Z', 'BKK → NRT · FY 308 · your seat', 'Discount × 0.50 · 4,600 km', 2300, 'Expires 12 Oct 2029'),
  flight(
    '2026-10-12T09:00:01Z',
    'BKK → NRT · FY 308 · Somchai Saranpat',
    'Booked by you · balance only, not tier',
    2300,
    'Expires 12 Oct 2029',
  ),
  flight(
    '2026-10-12T09:00:02Z',
    'BKK → NRT · FY 308 · Niran Saranpat',
    'Booked by you · balance only, not tier',
    2300,
    'Expires 12 Oct 2029',
  ),
]

const DEMO_REDEMPTIONS: RedemptionRow[] = [
  {
    transactionId: 'r-2',
    route: 'BKK → HKG',
    flightNumber: 'FY 815',
    departsAt: '2026-12-12T02:00:00Z',
    cabin: 'Economy',
    seats: 1,
    miles: 8000,
    bookingStatus: 'confirmed',
    bookedAt: '2026-09-19T10:00:00Z',
    bookingReference: 'K8RT2W',
    returned: false,
  },
  {
    transactionId: 'r-1',
    route: 'BKK → SIN',
    flightNumber: 'FY 405',
    departsAt: '2026-10-19T02:00:00Z',
    cabin: 'Economy',
    seats: 1,
    miles: 7500,
    bookingStatus: 'expired',
    bookedAt: '2026-10-03T08:00:00Z',
    bookingReference: null,
    returned: true,
  },
]

const DEMO_BENEFIT_USES: BenefitUse[] = [
  { id: 'b-3', kind: 'lounge', route: 'BKK → NRT', flightNumber: 'FY 308', usedAt: '2026-10-12T07:31:00Z', detail: 'Member only' },
  {
    id: 'b-2',
    kind: 'insurance',
    route: 'BKK → HKG',
    flightNumber: 'FY 815',
    usedAt: '2026-09-19T10:00:00Z',
    detail: 'Policy FLI-204815 · THB 190',
  },
  { id: 'b-1', kind: 'upgrade', route: 'BKK → SIN', flightNumber: 'FY 401', usedAt: '2026-05-11T09:00:00Z', detail: 'Economy to Business' },
]

function withBalances(rows: DemoRow[]): StatementRow[] {
  let balance = 0
  return rows.map((row, i) => {
    balance += row.miles
    return { ...row, seq: i + 1, balanceAfter: balance }
  })
}

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 250))
}

export function createMockLoyaltyApi(options: { member: boolean }): LoyaltyApi {
  let member: MemberSummary | null = null
  let statement: StatementRow[] = []
  let redemptions: RedemptionRow[] = []
  let benefitUses: BenefitUse[] = []

  if (options.member) {
    statement = withBalances(DEMO_LEDGER)
    redemptions = DEMO_REDEMPTIONS
    benefitUses = DEMO_BENEFIT_USES
    member = {
      memberNumber: 'FL10000142',
      name: 'Anya Saranpat',
      joinedAt: '2023-08-10T00:00:00Z',
      milesBalance: statement[statement.length - 1].balanceAfter,
      tier: { code: 'silver', name: 'Silver', expiresAt: '2027-10-12T00:00:00Z' },
      last12Months: { miles: 22275, flights: 9 },
      nextTier: { code: 'gold', name: 'Gold', minMiles: 40000, minFlights: 50, milesToGo: 17725, flightsToGo: 41 },
      expiringSoon: [{ expiresOn: '2026-11-06T00:00:00Z', miles: 5800 }],
    }
  }

  return {
    getTiers: () => wait(TIERS),
    getMember: () => wait(member),
    getStatement: () => wait([...statement].reverse()),
    getRedemptions: () => wait(redemptions),
    getBenefitUses: () => wait(benefitUses),
    async join(name) {
      if (member) throw new Error('You are already a member.')
      // Miles are never added for flights before joining, so a new member starts at 0.
      member = {
        memberNumber: 'FL10000960',
        name,
        joinedAt: new Date().toISOString(),
        milesBalance: 0,
        tier: null,
        last12Months: { miles: 0, flights: 0 },
        nextTier: { code: 'silver', name: 'Silver', minMiles: 15000, minFlights: 20, milesToGo: 15000, flightsToGo: 20 },
        expiringSoon: [],
      }
      return wait(member)
    },
  }
}
