import type {
  AwardFlight,
  CabinCode,
  EarnRuleRow,
  LoungeMember,
  LoungeResult,
  LoungeVisit,
  LoyaltySettings,
  MemberDetail,
  StaffLedgerRow,
  StaffLoyaltyApi,
  TierBenefits,
  TierCode,
  TierRule,
} from './types'

// In-memory stand-in for the Feature 11 staff API until the loyalty tables and feature 3's seat inventory exist.
// It refuses what the backend and database will refuse, so the pages show the same messages. The demo data matches the
// Feature 11 Figma screens.

const MULTIPLIER = /^\d{1,2}(\.\d{1,2})?$/
const number = new Intl.NumberFormat('en-GB')

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 250))
}

function refuse(message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 250))
}

function isPositiveInteger(n: number) {
  return Number.isInteger(n) && n > 0
}

type DemoRow = [miles: number, type: StaffLedgerRow['type'], date: string, title: string, detail: string]

const earn = (miles: number, date: string, title: string, detail: string): DemoRow => [miles, 'earn', date, title, detail]

// Builds a ledger from demo rows (oldest first) and returns it newest first.
function ledger(rows: DemoRow[]): StaffLedgerRow[] {
  let balance = 0
  return rows
    .map(([miles, type, date, title, detail], i) => {
      balance += miles
      return {
        seq: i + 1,
        type,
        miles,
        balanceAfter: balance,
        occurredAt: `${date}T09:00:${String(i % 60).padStart(2, '0')}Z`,
        title,
        detail,
      }
    })
    .reverse()
}

function member(
  id: string,
  memberNumber: string,
  customerId: string,
  name: string,
  email: string,
  joinedAt: string,
  tier: { code: TierCode; name: string; expiresAt: string } | null,
  rows: DemoRow[],
): MemberDetail {
  const rowsNewestFirst = ledger(rows)
  return {
    id,
    memberNumber,
    customerId,
    name,
    email,
    joinedAt,
    tier: tier && { code: tier.code, name: tier.name },
    tierExpiresAt: tier?.expiresAt ?? null,
    milesBalance: rowsNewestFirst[0]?.balanceAfter ?? 0,
    ledger: rowsNewestFirst,
  }
}

const NRT_BIZ = 'Business × 1.50 · 4,600 km'

export function createMockStaffLoyaltyApi(): StaffLoyaltyApi {
  const tiers: TierRule[] = [
    { code: 'silver', name: 'Silver', rank: 1, minMiles: 15000, minFlights: 20, validMonths: 12 },
    { code: 'gold', name: 'Gold', rank: 2, minMiles: 40000, minFlights: 50, validMonths: 12 },
    { code: 'platinum', name: 'Platinum', rank: 3, minMiles: 80000, minFlights: 100, validMonths: 12 },
  ]
  const benefits: Record<TierCode, TierBenefits> = {
    silver: {
      loungeGuests: 0,
      bonusBaggageKg: 5,
      priorityCheckIn: false,
      priorityBoarding: false,
      complimentaryUpgrade: true,
      insurance: { kind: 'member_price', priceThb: 190 },
    },
    gold: {
      loungeGuests: 1,
      bonusBaggageKg: 10,
      priorityCheckIn: true,
      priorityBoarding: true,
      complimentaryUpgrade: true,
      insurance: { kind: 'included' },
    },
    platinum: {
      loungeGuests: 2,
      bonusBaggageKg: 20,
      priorityCheckIn: true,
      priorityBoarding: true,
      complimentaryUpgrade: true,
      insurance: { kind: 'included' },
    },
  }
  const earnRules: EarnRuleRow[] = [
    { fareClassId: 'fc-y', fareClassName: 'Full fare', fareClassCode: 'Y', multiplier: '1.00' },
    { fareClassId: 'fc-m', fareClassName: 'Discount', fareClassCode: 'M', multiplier: '0.50' },
    { fareClassId: 'fc-j', fareClassName: 'Business', fareClassCode: 'J', multiplier: '1.50' },
  ]
  let settings: LoyaltySettings = { milesRetentionMonths: 36, expiryReminderDays: 30, awardCutoffHours: 72 }

  const a320 = { name: 'A320', cabins: ['economy', 'business'] as CabinCode[] }
  const flight = (
    flightId: string,
    flightNumber: string,
    route: string,
    date: string,
    status: AwardFlight['status'],
    releases: AwardFlight['releases'] = {},
    returnedToCash = false,
  ): AwardFlight => ({ flightId, flightNumber, route, departsAt: `${date}T02:00:00Z`, status, aircraft: a320, releases, returnedToCash })

  const flights: AwardFlight[] = [
    flight('f-811', 'FY 811', 'BKK → HKG', '2026-12-19', 'scheduled', {
      economy: { released: 6, redeemed: 2, milesCost: 8000 },
      business: { released: 2, redeemed: 0, milesCost: 20000 },
    }),
    flight('f-815', 'FY 815', 'BKK → HKG', '2026-12-12', 'scheduled', { economy: { released: 4, redeemed: 3, milesCost: 8000 } }),
    flight('f-405', 'FY 405', 'BKK → SIN', '2026-10-19', 'scheduled', { economy: { released: 4, redeemed: 0, milesCost: 7500 } }),
    flight('f-401', 'FY 401', 'BKK → SIN', '2026-12-15', 'delayed', { economy: { released: 6, redeemed: 0, milesCost: 7500 } }),
    flight('f-601', 'FY 601', 'BKK → NRT', '2026-12-20', 'scheduled', {
      economy: { released: 3, redeemed: 0, milesCost: 17500 },
      business: { released: 2, redeemed: 0, milesCost: 40000 },
    }),
    flight('f-309', 'FY 309', 'NRT → BKK', '2026-12-21', 'scheduled'),
    flight('f-403', 'FY 403', 'BKK → SIN', '2026-10-14', 'scheduled', { economy: { released: 1, redeemed: 1, milesCost: 7500 } }, true),
    flight('f-255', 'FY 255', 'BKK → RGN', '2026-10-13', 'cancelled'),
    flight('f-308', 'FY 308', 'BKK → NRT', '2026-10-12', 'departed'),
  ]

  const members: MemberDetail[] = [
    member('m-142', 'FL10000142', 'C-10201', 'Anya Saranpat', 'anya.s@example.com', '2023-08-10T00:00:00Z', silver('2027-10-12'), [
      earn(292, '2023-08-14', 'BKK → CNX · FY 120', 'Discount × 0.50 · 583 km'),
      earn(6900, '2023-11-02', 'BKK → NRT · FY 601', NRT_BIZ),
      earn(6900, '2023-11-06', 'NRT → BKK · FY 602', NRT_BIZ),
      earn(1722, '2026-02-14', 'BKK → HKG · FY 811', 'Full fare × 1.00 · 1,722 km'),
      earn(1722, '2026-02-18', 'HKG → BKK · FY 812', 'Full fare × 1.00 · 1,722 km'),
      earn(6900, '2026-03-09', 'BKK → NRT · FY 601', NRT_BIZ),
      earn(6900, '2026-03-16', 'NRT → BKK · FY 602', NRT_BIZ),
      earn(1431, '2026-05-11', 'BKK → SIN · FY 401', 'Full fare × 1.00 · 1,431 km'),
      earn(716, '2026-05-14', 'SIN → BKK · FY 402', 'Discount × 0.50 · 1,431 km'),
      earn(292, '2026-08-02', 'BKK → CNX · FY 120', 'Discount × 0.50 · 583 km'),
      earn(292, '2026-08-05', 'CNX → BKK · FY 121', 'Discount × 0.50 · 583 km'),
      [-292, 'expire', '2026-08-14', 'Miles expired', 'From FY 120 on 14 Aug 2023'],
      [-8000, 'redeem', '2026-09-19', 'Award seat · BKK → HKG · FY 815', 'Economy · 12 Dec 2026'],
      [-7500, 'redeem', '2026-10-03', 'Award seat · BKK → SIN · FY 405', 'Economy · 19 Oct 2026'],
      [7500, 'redeem_reversal', '2026-10-03', 'Miles returned', 'Hold on FY 405 ended'],
      [500, 'adjust', '2026-10-11', 'Service recovery', 'Delayed bag case · by Kaow Srisuk'],
      earn(2300, '2026-10-12', 'BKK → NRT · FY 308 · own seat', 'Discount × 0.50 · 4,600 km'),
      earn(2300, '2026-10-12', 'BKK → NRT · FY 308 · Somchai Saranpat', 'Booked by member · Discount × 0.50 · 4,600 km'),
      earn(2300, '2026-10-12', 'BKK → NRT · FY 308 · Niran Saranpat', 'Booked by member · Discount × 0.50 · 4,600 km'),
    ]),
    member('m-377', 'FL10000377', 'C-10482', 'Sara Lopez', 'sara.lopez@example.com', '2025-09-01T00:00:00Z', gold('2027-09-02'), [
      earn(6900, '2025-09-15', 'BKK → NRT · FY 601', NRT_BIZ),
      earn(6900, '2025-09-20', 'NRT → BKK · FY 602', NRT_BIZ),
      earn(6900, '2026-01-10', 'BKK → NRT · FY 601', NRT_BIZ),
      earn(6900, '2026-01-17', 'NRT → BKK · FY 602', NRT_BIZ),
      earn(11295, '2026-06-03', 'BKK → SYD · FY 465', 'Business × 1.50 · 7,530 km'),
      earn(11295, '2026-06-10', 'SYD → BKK · FY 466', 'Business × 1.50 · 7,530 km'),
      earn(1722, '2026-09-02', 'BKK → HKG · FY 811', 'Full fare × 1.00 · 1,722 km'),
      [-8000, 'redeem', '2026-09-18', 'Award seat · BKK → HKG · FY 811', 'Economy · 19 Dec 2026'],
    ]),
    member(
      'm-482',
      'FL10000482',
      'C-10533',
      'Chloe Martin',
      'chloe.m@example.com',
      '2026-01-02T00:00:00Z',
      { code: 'platinum', name: 'Platinum', expiresAt: '2027-10-05T00:00:00Z' },
      ['2026-01-12', '2026-01-20', '2026-04-08', '2026-04-16', '2026-09-28', '2026-10-05'].map((date, i) =>
        earn(14310, date, i % 2 ? 'LHR → BKK · FY 932' : 'BKK → LHR · FY 931', 'Business × 1.50 · 9,540 km'),
      ),
    ),
    member('m-521', 'FL10000521', 'C-10611', 'Mai Tran', 'mai.t@example.com', '2026-08-01T00:00:00Z', null, [
      earn(861, '2026-10-06', 'BKK → HKG · FY 811', 'Discount × 0.50 · 1,722 km'),
      earn(861, '2026-10-10', 'HKG → BKK · FY 812', 'Discount × 0.50 · 1,722 km'),
    ]),
    member('m-960', 'FL10000960', 'C-10702', 'Anna Lee', 'anna.l@example.com', '2026-10-12T00:00:00Z', null, []),
  ]

  // What the lounge desk sees for each member today: the ticket comes from feature 3b.
  const tickets: Record<string, string | null> = {
    FL10000142: 'FY 308 · BKK → NRT · departs 09:10 · checked in',
    FL10000377: 'FY 811 · BKK → HKG · departs 09:35',
    FL10000482: null,
    FL10000521: 'FY 811 · BKK → HKG · departs 09:35',
    FL10000960: null,
  }
  const bookingRefs: Record<string, string> = { FLY7K2: 'FL10000142' }
  const visits: LoungeVisit[] = [
    { id: 'v-1', time: '06:52', memberName: 'Nok Suwan', tierName: 'Platinum', flightNumber: 'FY 601', guests: 2 },
    { id: 'v-2', time: '07:05', memberName: 'Arun Pichai', tierName: 'Gold', flightNumber: 'FY 405', guests: 1 },
  ]

  const findFlight = (flightId: string) => flights.find((f) => f.flightId === flightId)

  return {
    getRules: () => wait({ tiers, benefits, earnRules, settings }),

    updateTier(code, patch) {
      const tier = tiers.find((t) => t.code === code)
      if (!tier) return refuse('Unknown tier.')
      if (![patch.minMiles, patch.minFlights, patch.validMonths].every(isPositiveInteger)) {
        return refuse('Miles, flights and validity must be whole numbers above 0, or every member would qualify.')
      }
      Object.assign(tier, patch)
      return wait(tier)
    },

    updateTierBenefits(code, next) {
      if (next.loungeGuests !== null && (!Number.isInteger(next.loungeGuests) || next.loungeGuests < 0 || next.loungeGuests > 2)) {
        return refuse('Lounge access is the member only, or the member plus up to 2 guests.')
      }
      if (!(next.bonusBaggageKg >= 0) || Math.round(next.bonusBaggageKg * 10) !== next.bonusBaggageKg * 10) {
        return refuse('Extra baggage must be 0 or more, in steps of 0.1 kg.')
      }
      benefits[code] = { ...next }
      return wait(benefits[code])
    },

    setEarnMultiplier(fareClassId, multiplier) {
      const row = earnRules.find((r) => r.fareClassId === fareClassId)
      if (!row) return refuse('Unknown fare class.')
      if (!MULTIPLIER.test(multiplier)) return refuse('Multiplier must be between 0 and 99.99, two decimals at most.')
      row.multiplier = Number(multiplier).toFixed(2)
      return wait(row)
    },

    updateSettings(next) {
      if (![next.milesRetentionMonths, next.expiryReminderDays, next.awardCutoffHours].every(isPositiveInteger)) {
        return refuse('Every setting must be a whole number above 0.')
      }
      settings = { ...next }
      return wait(settings)
    },

    getAwardFlights: () => wait(flights),

    saveRelease(flightId, cabin, released, milesCost) {
      const found = findFlight(flightId)
      if (!found) return refuse('Unknown flight.')
      if (found.status === 'cancelled' || found.status === 'departed') return refuse('This flight is closed.')
      if (found.returnedToCash) return refuse(`Award seats closed ${settings.awardCutoffHours} hours before departure.`)
      if (!found.aircraft.cabins.includes(cabin)) return refuse(`This aircraft (${found.aircraft.name}) has no such cabin.`)
      const redeemed = found.releases[cabin]?.redeemed ?? 0
      if (!Number.isInteger(released) || released < 0) return refuse('Seats must be a whole number, 0 or more.')
      if (released < redeemed) return refuse(`Can’t go below the ${redeemed} seats already redeemed.`)
      if (!isPositiveInteger(milesCost)) return refuse('Miles per seat must be a whole number above 0.')
      found.releases[cabin] = { released, redeemed, milesCost }
      return wait(found)
    },

    searchMembers(query) {
      const q = query.trim().toLowerCase()
      const found = members.filter((m) => !q || [m.memberNumber, m.name, m.email].some((v) => v.toLowerCase().includes(q)))
      return wait(
        found.map(({ id, memberNumber, name, email, milesBalance, tier }) => ({ id, memberNumber, name, email, milesBalance, tier })),
      )
    },

    getMember(id) {
      const found = members.find((m) => m.id === id)
      return found ? wait(found) : refuse('Member not found.')
    },

    adjustMiles(id, miles, reason) {
      const found = members.find((m) => m.id === id)
      if (!found) return refuse('Member not found.')
      if (!Number.isInteger(miles) || miles === 0) return refuse('Miles must be a whole number above 0.')
      if (reason.trim() === '') return refuse('Required. Adjustments are never applied without a reason.')
      const after = found.milesBalance + miles
      if (after < 0) {
        return refuse(`Removing ${number.format(-miles)} would leave −${number.format(-after)} miles. The balance can’t go below 0.`)
      }
      found.milesBalance = after
      found.ledger.unshift({
        seq: (found.ledger[0]?.seq ?? 0) + 1,
        type: 'adjust',
        miles,
        balanceAfter: after,
        occurredAt: new Date().toISOString(),
        title: reason.trim(),
        detail: 'Manual adjustment · by you',
      })
      return wait(found)
    },

    checkInLounge(query, guests) {
      const key = query.trim().toUpperCase()
      const memberNumber = bookingRefs[key] ?? key
      const found = members.find((m) => m.memberNumber === memberNumber)
      if (!found) return refuse('No member or booking matches that number.')
      const guestsAllowed = found.tier ? benefits[found.tier.code].loungeGuests : null
      const ticket = tickets[found.memberNumber] ?? null
      const desk: LoungeMember = {
        name: found.name,
        memberNumber: found.memberNumber,
        tierName: found.tier?.name ?? null,
        guestsAllowed,
        ticket,
      }
      if (!found.tier || guestsAllowed === null) return wait<LoungeResult>({ outcome: 'refused', reason: 'no_tier', member: desk })
      if (!ticket) return wait<LoungeResult>({ outcome: 'refused', reason: 'no_ticket', member: desk })
      if (guests > guestsAllowed) return wait<LoungeResult>({ outcome: 'refused', reason: 'too_many_guests', member: desk })
      const flightNumber = ticket.split(' · ')[0]
      if (visits.some((v) => v.memberName === found.name && v.flightNumber === flightNumber)) {
        return wait<LoungeResult>({ outcome: 'refused', reason: 'already_visited', member: desk })
      }
      const now = new Date()
      visits.push({
        id: `v-${visits.length + 1}`,
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        memberName: found.name,
        tierName: found.tier.name,
        flightNumber,
        guests,
      })
      return wait<LoungeResult>({ outcome: 'admitted', member: desk, flightNumber, guests })
    },

    getLoungeVisits: () => wait(visits),
  }
}

function silver(expiresOn: string) {
  return { code: 'silver' as const, name: 'Silver', expiresAt: `${expiresOn}T00:00:00Z` }
}

function gold(expiresOn: string) {
  return { code: 'gold' as const, name: 'Gold', expiresAt: `${expiresOn}T00:00:00Z` }
}
