import path from 'node:path'
import { faker } from '@faker-js/faker'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'))
} catch {
  // .env is optional (e.g. DATABASE_URL provided by the shell/CI)
}

const CUSTOMER_COUNT = 3
const STAFF_COUNT = 2
const REFRESH_TOKENS_PER_USER = 2
const STAFF_ROLES = [
  { code: 'check-in', name: 'Check-in', is_admin: false },
  { code: 'gate', name: 'Gate', is_admin: false },
  { code: 'baggage', name: 'Baggage', is_admin: false },
  { code: 'admin', name: 'Admin', is_admin: true },
  { code: 'cs-agent', name: 'CS Agent', is_admin: false },
  { code: 'cs-supervisor', name: 'CS Supervisor', is_admin: false },
]
const GENDERS = ['M', 'F', 'X']

// Feature 2's demo network. HKT has no approval policy and its routes have no partner, so both cases can be tried.
const AIRPORTS = [
  { iata_code: 'BKK', icao_code: 'VTBS', name: 'Suvarnabhumi', city: 'Bangkok', min_turnaround_min: 45 },
  { iata_code: 'CNX', icao_code: 'VTCC', name: 'Chiang Mai', city: 'Chiang Mai', min_turnaround_min: 40 },
  { iata_code: 'HKT', icao_code: 'VTSP', name: 'Phuket', city: 'Phuket', min_turnaround_min: 40 },
].map((airport) => ({ ...airport, country: 'th', timezone: 'Asia/Bangkok' }))
const PARTNER_AIRLINES = [
  { code: 'PA', name: 'Partner Air' },
  { code: 'SC', name: 'Sky Connect' },
]
const ROUTES = [
  { origin: 'BKK', destination: 'CNX', distance_km: 596, block_time_min: 75, partners: ['PA'] },
  { origin: 'CNX', destination: 'BKK', distance_km: 596, block_time_min: 75, partners: ['PA', 'SC'] },
  { origin: 'BKK', destination: 'HKT', distance_km: 675, block_time_min: 85, partners: [] },
  { origin: 'HKT', destination: 'BKK', distance_km: 675, block_time_min: 85, partners: [] },
]
const APPROVAL_POLICIES = [
  { airport: 'BKK', curfew_start_local: '00:00', curfew_end_local: '05:00', max_departure_per_hour: 20, offer_style: 'slots' },
  { airport: 'CNX', curfew_start_local: '23:00', curfew_end_local: '06:00', max_departure_per_hour: 8, offer_style: 'window' },
]
// Feature 2's demo reference data, so the staff screens can be tried straight after a seed: the fixed disruption reasons (one per category),
// the airline code, two aircraft types, four aircraft and the four repeat patterns of the demo network. The aircraft belong to Feature 9;
// they are upserted by their tail number, so its own seed can replace them. Currency rates for the cost estimate are seeded with the staff.
const DISRUPTION_REASONS = [
  { code: 'WX', category: 'weather', description: 'Weather' },
  { code: 'TECH', category: 'technical', description: 'Technical fault' },
  { code: 'CREW', category: 'crew', description: 'Crew availability' },
  { code: 'ATC', category: 'air_traffic_control', description: 'Air traffic control restriction' },
  { code: 'SEC', category: 'security', description: 'Security' },
  { code: 'APT', category: 'airport_operations', description: 'Airport operations' },
  { code: 'OTH', category: 'other', description: 'Other' },
]
const AIRLINE_CODE = 'XX'
const AIRCRAFT_TYPES = [
  {
    code: 'A320',
    manufacturer: 'Airbus',
    model: 'A320-200',
    layout: { rows: 30, seats_per_row: 6 },
    hold_weight_limit_kg: 20000,
    max_takeoff_weight_kg: 78000,
    max_range_km: 6100,
    min_turnaround_minutes: 50,
    operating_cost_per_hour: 4500,
    cost_currency: 'USD',
  },
  {
    code: 'ATR72',
    manufacturer: 'ATR',
    model: 'ATR 72-600',
    layout: { rows: 18, seats_per_row: 4 },
    hold_weight_limit_kg: 6000,
    max_takeoff_weight_kg: 23000,
    max_range_km: 1500,
    min_turnaround_minutes: 35,
    operating_cost_per_hour: 1800,
    cost_currency: 'USD',
  },
]
const AIRCRAFT = [
  { tail_number: 'HS-XA1', type: 'A320', base_airport_code: 'BKK' },
  { tail_number: 'HS-XA2', type: 'A320', base_airport_code: 'BKK' },
  { tail_number: 'HS-XA3', type: 'A320', base_airport_code: 'CNX' },
  { tail_number: 'HS-XT1', type: 'ATR72', base_airport_code: 'HKT' },
]
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const PATTERNS = [
  { flight_number: 'XX101', origin: 'BKK', destination: 'CNX', dep_time_local: '08:00', days_of_week: ALL_DAYS },
  { flight_number: 'XX102', origin: 'CNX', destination: 'BKK', dep_time_local: '10:30', days_of_week: ALL_DAYS },
  { flight_number: 'XX201', origin: 'BKK', destination: 'HKT', dep_time_local: '13:00', days_of_week: [1, 3, 5] },
  { flight_number: 'XX202', origin: 'HKT', destination: 'BKK', dep_time_local: '15:30', days_of_week: [1, 3, 5] },
]
const PATTERN_DAYS = 75
// 1 USD is about 35 THB; the table holds units of the currency per unit of the base (THB).
const CURRENCY_RATES = [{ currency_code: 'USD', rate_per_base: 0.028571 }]

const PRICING_SETTINGS = [
  { key: 'quote_hold_minutes', value: '15' },
  { key: 'base_currency', value: 'THB' },
]

// Feature 6: the final demo needs two gates at one airport. The visa rows are examples, not real visa policy
// (no row means no visa is needed), and the bag tag airline number is the doc's placeholder.
const GATES = [
  { airport_code: 'BKK', code: 'A1' },
  { airport_code: 'BKK', code: 'A2' },
]
const VISA_REQUIREMENTS = [
  { nationality: 'ng', destination_country: 'th', visa_required: true },
  { nationality: 'jp', destination_country: 'th', visa_required: false },
]
const BAG_TAG_AIRLINE_NUMBER = '999'

// Feature 10: a baggage desk at each demo airport. Placeholder numbers and example.com addresses, not real contacts.
const STATION_CONTACTS = [
  { airport_code: 'BKK', desk_name: 'BKK Baggage Services', phone: '+66 2 000 0001', email: 'baggage.bkk@example.com' },
  { airport_code: 'CNX', desk_name: 'CNX Baggage Services', phone: '+66 53 000 001', email: 'baggage.cnx@example.com' },
  { airport_code: 'HKT', desk_name: 'HKT Baggage Services', phone: '+66 76 000 001', email: 'baggage.hkt@example.com' },
]

// Feature 11: placeholder miles multipliers for Feature 4's demo fare classes, by fare class code. Feature 4's seed
// creates the classes; a class that is not there yet gets no rule.
const EARN_MULTIPLIERS: Record<string, number> = { Y: 1, Q: 0.5, W: 1.25, J: 1.5, F: 2 }

// Feature 5: placeholder crew pay per Feature 8 crew role, in the base currency. Staff maintain the real rates.
const CREW_PAY_RATES = [
  { crew_role: 'captain', hourly_rate: 85, per_diem: 40 },
  { crew_role: 'first_officer', hourly_rate: 60, per_diem: 40 },
  { crew_role: 'cabin_crew', hourly_rate: 25, per_diem: 30 },
  { crew_role: 'police', hourly_rate: 30, per_diem: 30 },
]
// Feature 4's test data. Amounts are in the base currency. docs/feature-04-test-cases.md uses these codes.
const FARE_CLASSES = [
  {
    code: 'Y',
    cabin: 'economy',
    name: 'Economy Flex',
    refundable: true,
    changeable: true,
    cancel_fee_flat: 500,
    cancel_fee_pct: 5,
    change_fee_flat: 300,
  },
  { code: 'Q', cabin: 'economy', name: 'Economy Saver', min_advance_purchase_days: 7 },
  { code: 'W', cabin: 'premium_economy', name: 'Premium Economy', refundable: true, changeable: true, cancel_fee_pct: 10 },
  { code: 'J', cabin: 'business', name: 'Business', refundable: true, changeable: true },
  { code: 'F', cabin: 'first', name: 'First', refundable: true, changeable: true },
]
// Quotes look a seat fee up by cabin and seat type, so every pair needs a row, even when it is free.
const SEAT_FEE_GRID = {
  economy: { normal: 0, exit_row: 300, extra_legroom: 400 },
  premium_economy: { normal: 0, exit_row: 200, extra_legroom: 300 },
  business: { normal: 0, exit_row: 0, extra_legroom: 0 },
  first: { normal: 0, exit_row: 0, extra_legroom: 0 },
}
const TAX_FEES = [
  { code: 'VAT', name: 'VAT', kind: 'tax', calc_type: 'pct', value: 7 },
  { code: 'APT_FEE', name: 'Airport fee', kind: 'fee', calc_type: 'flat', value: 700 },
  { code: 'FUEL', name: 'Fuel surcharge', kind: 'surcharge', calc_type: 'flat', value: 250 },
]
// The API refuses a free allowance at or above the maximum bag.
const BAGGAGE_BY_CABIN = {
  economy: { free_allowance_kg: 20, rate_per_kg: 200, max_bag_kg: 32 },
  premium_economy: { free_allowance_kg: 25, rate_per_kg: 180, max_bag_kg: 32 },
  business: { free_allowance_kg: 30, rate_per_kg: 150, max_bag_kg: 32 },
  first: { free_allowance_kg: 40, rate_per_kg: 120, max_bag_kg: 45 },
}
const BAGGAGE_ROUTE_OVERRIDE = {
  fare_class: 'Y',
  origin: 'BKK',
  destination: 'CNX',
  free_allowance_kg: 25,
  rate_per_kg: 250,
  max_bag_kg: 32,
}
const DAY_MS = 86_400_000

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// Roles are reference data (the sign-in flow looks up 'admin'), so upsert them rather than create:
// running the seed twice, or after the Level 1 seed file, must not fail on the unique code.
async function seedRoles(): Promise<string[]> {
  const ids: string[] = []
  for (const role of STAFF_ROLES) {
    const row = await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role })
    ids.push(row.id)
  }
  return ids
}

// Prisma maps TIME columns to a Date and keeps only its UTC time of day.
const timeOfDay = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`)

// Upserted like the roles, with no update, so running the seed again keeps any edits made in the app.
async function seedFlightNetwork() {
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }
  for (const partner of PARTNER_AIRLINES) {
    await prisma.partner_airline.upsert({ where: { code: partner.code }, update: {}, create: partner })
  }
  for (const { partners, ...route } of ROUTES) {
    const { id } = await prisma.route.upsert({
      where: { origin_destination: { origin: route.origin, destination: route.destination } },
      update: {},
      create: route,
    })
    for (const partner_airline of partners) {
      await prisma.partner_airline_route.upsert({
        where: { partner_airline_route_id: { partner_airline, route_id: id } },
        update: {},
        create: { partner_airline, route_id: id },
      })
    }
  }
  for (const { curfew_start_local, curfew_end_local, ...policy } of APPROVAL_POLICIES) {
    await prisma.airport_approval_policy.upsert({
      where: { airport: policy.airport },
      update: {},
      create: { ...policy, curfew_start_local: timeOfDay(curfew_start_local), curfew_end_local: timeOfDay(curfew_end_local) },
    })
  }
}

// Upserted like the flight network, and needs it: the patterns point at the routes. The partial unique indexes on aircraft cannot back a Prisma
// upsert, so those use skipDuplicates like the pricing catalog below.
async function seedFlightSchedulingDemo() {
  for (const reason of DISRUPTION_REASONS) {
    await prisma.disruption_reason.upsert({ where: { code: reason.code }, update: {}, create: reason })
  }
  await prisma.flight_setting.upsert({
    where: { key: 'airline_code' },
    update: {},
    create: { key: 'airline_code', value: AIRLINE_CODE },
  })
  await prisma.aircraft_type.createMany({ data: AIRCRAFT_TYPES, skipDuplicates: true })
  const types = await prisma.aircraft_type.findMany({ where: { deleted_at: null }, select: { id: true, code: true } })
  const typeId = new Map(types.map((t) => [t.code, t.id]))
  await prisma.aircraft.createMany({
    data: AIRCRAFT.map(({ type, ...aircraft }) => ({
      ...aircraft,
      aircraft_type_id: typeId.get(type) as string,
      entry_into_service_date: new Date('2024-01-15T00:00:00Z'),
    })),
    skipDuplicates: true,
  })

  // From today (UTC) for a while, so the demo always has dates ahead of it.
  const from = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
  const to = new Date(from.getTime() + PATTERN_DAYS * 24 * 60 * 60 * 1000)
  for (const { origin, destination, dep_time_local, ...pattern } of PATTERNS) {
    const route = await prisma.route.findUnique({ where: { origin_destination: { origin, destination } }, select: { id: true } })
    if (!route) continue
    await prisma.flight_pattern.upsert({
      where: { flight_number: pattern.flight_number },
      update: {},
      create: { ...pattern, route_id: route.id, dep_time_local: timeOfDay(dep_time_local), valid_from: from, valid_to: to },
    })
  }
}

// Needs a staff member for `updated_by`, so it runs after the staff are seeded.
async function seedCurrencyRates() {
  const staff = await prisma.staff.findFirst({ select: { id: true } })
  if (!staff) return
  for (const rate of CURRENCY_RATES) {
    await prisma.currency_rate.upsert({
      where: { currency_code: rate.currency_code },
      update: {},
      create: { ...rate, updated_by: staff.id },
    })
  }
}

// Upserted like the flight network. Gates need the airports above.
async function seedCheckIn() {
  for (const gate of GATES) {
    await prisma.gate.upsert({ where: { airport_code_code: gate }, update: {}, create: gate })
  }
  for (const visa of VISA_REQUIREMENTS) {
    const { nationality, destination_country } = visa
    await prisma.visa_requirement.upsert({
      where: { nationality_destination_country: { nationality, destination_country } },
      update: {},
      create: visa,
    })
  }
  await prisma.check_in_setting.upsert({
    where: { key: 'bag_tag_airline_number' },
    update: {},
    create: { key: 'bag_tag_airline_number', value: BAG_TAG_AIRLINE_NUMBER },
  })
}

// Upserted like the flight network. Contacts need the airports above.
async function seedLostAndFound() {
  for (const contact of STATION_CONTACTS) {
    await prisma.station_contact.upsert({ where: { airport_code: contact.airport_code }, update: {}, create: contact })
  }
}

// Upserted with no update, so a rerun keeps the multipliers staff changed in the app.
async function seedLoyalty() {
  const fareClasses = await prisma.fare_class.findMany({ where: { code: { in: Object.keys(EARN_MULTIPLIERS) }, deleted_at: null } })
  for (const { id, code } of fareClasses) {
    await prisma.loyalty_earn_rule.upsert({
      where: { fare_class_id: id },
      update: {},
      create: { fare_class_id: id, multiplier: EARN_MULTIPLIERS[code] },
    })
  }
}

// Upserted with no update, so a rerun keeps the rates staff changed in the app.
async function seedCrewPay() {
  for (const rate of CREW_PAY_RATES) {
    await prisma.crew_pay_rate.upsert({ where: { crew_role: rate.crew_role }, update: {}, create: rate })
  }
}

// Same defaults as Feature 4's PRICING_SETTING_DEFAULTS. Upserted with no update, so a changed quote hold window survives a re-seed.
async function seedPricingSettings() {
  for (const setting of PRICING_SETTINGS) {
    await prisma.pricing_setting.upsert({ where: { key: setting.key }, update: {}, create: setting })
  }
}

// The unique indexes only cover live rows, so a Prisma upsert can't use them. skipDuplicates (ON CONFLICT DO NOTHING) gives the
// same result as the upserts above: running the seed again keeps existing rows, and any edits made in the app.
async function seedPricingCatalog() {
  await prisma.fare_class.createMany({ data: FARE_CLASSES, skipDuplicates: true })
  await prisma.seat_fee.createMany({
    data: Object.entries(SEAT_FEE_GRID).flatMap(([cabin, fees]) =>
      Object.entries(fees).map(([seat_type, amount]) => ({ cabin, seat_type, amount })),
    ),
    skipDuplicates: true,
  })
  await prisma.tax_fee.createMany({ data: TAX_FEES, skipDuplicates: true })

  const fareClasses = await prisma.fare_class.findMany({ where: { code: { in: FARE_CLASSES.map((row) => row.code) }, deleted_at: null } })
  const { fare_class, origin, destination, ...override } = BAGGAGE_ROUTE_OVERRIDE
  const overrideRoute = await prisma.route.findFirst({ where: { origin, destination } })
  const overrideClass = fareClasses.find((row) => row.code === fare_class)
  await prisma.overweight_baggage_rate.createMany({
    data: [
      ...fareClasses.map((row) => ({ fare_class_id: row.id, ...BAGGAGE_BY_CABIN[row.cabin as keyof typeof BAGGAGE_BY_CABIN] })),
      ...(overrideRoute && overrideClass ? [{ ...override, fare_class_id: overrideClass.id, route_id: overrideRoute.id }] : []),
    ],
    skipDuplicates: true,
  })

  // One code in each state the Promo codes card shows, with dates relative to today so they don't go stale.
  const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS)
  const live = { valid_from: daysFromNow(-30), valid_to: daysFromNow(365) }
  await prisma.promo_code.createMany({
    data: [
      { code: 'SAVE10', kind: 'promo', discount_pct: 10, ...live },
      { code: 'MINUS20', kind: 'promo', discount_amount: 20, ...live },
      { code: 'CORP15', kind: 'corporate', discount_pct: 15, ...live },
      { code: 'SOON20', kind: 'promo', discount_pct: 20, valid_from: daysFromNow(30), valid_to: daysFromNow(120) },
      { code: 'OLD5', kind: 'promo', discount_pct: 5, valid_from: daysFromNow(-120), valid_to: daysFromNow(-30) },
      { code: 'SOLDOUT', kind: 'promo', discount_pct: 25, max_uses: 50, used_count: 50, ...live },
      { code: 'PAUSED', kind: 'promo', discount_pct: 5, is_active: false, ...live },
    ],
    skipDuplicates: true,
  })
}

async function seedCustomer() {
  const user = await prisma.user.create({
    data: {
      type: 'customer',
      email: faker.internet.email().toLowerCase(),
      clerk_user_id: `user_${faker.string.alphanumeric(24)}`,
    },
  })

  // A customer's identity (names, date of birth, gender, nationality) lives on the passenger row.
  const passenger = await prisma.passenger.create({
    data: {
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      date_of_birth: faker.date.birthdate(),
      gender: faker.helpers.arrayElement(GENDERS),
      nationality: faker.location.countryCode('alpha-2').toLowerCase(),
    },
  })

  await prisma.customer.create({
    data: {
      user_id: user.id,
      passenger_id: passenger.id,
      phone: faker.phone.number(),
      profile_photo_url: faker.image.avatar(),
    },
  })

  return user
}

async function seedStaff(roleIds: string[]) {
  const user = await prisma.user.create({
    data: {
      type: 'staff',
      email: faker.internet.email().toLowerCase(),
      clerk_user_id: `user_${faker.string.alphanumeric(24)}`,
    },
  })

  await prisma.staff.create({
    data: {
      user_id: user.id,
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      role_id: faker.helpers.arrayElement(roleIds),
    },
  })

  return user
}

async function seedRefreshTokens(userId: string) {
  await prisma.refresh_token.createMany({
    data: Array.from({ length: REFRESH_TOKENS_PER_USER }, () => ({
      user_id: userId,
      token_hash: faker.string.alphanumeric(64),
      expires_at: faker.date.future(),
    })),
  })
}

async function seedCustomerService() {
  console.log('Seeding Feature 13 (Customer Service)...')
  const csSupRole = await prisma.role.findFirst({ where: { code: 'cs-supervisor' } })
  const csAgentRole = await prisma.role.findFirst({ where: { code: 'cs-agent' } })
  if (!csSupRole || !csAgentRole) return

  const staffSeeds = [
    { email: 'tong.c@flython.com', first_name: 'Tong', last_name: 'Charoen', role_id: csSupRole.id },
    { email: 'ploy.w@flython.com', first_name: 'Ploy', last_name: 'Wong', role_id: csAgentRole.id },
    { email: 'mali.r@flython.com', first_name: 'Mali', last_name: 'Rattana', role_id: csAgentRole.id },
    { email: 'somsak.j@flython.com', first_name: 'Somsak', last_name: 'Jaidee', role_id: csAgentRole.id },
    { email: 'kenji.s@flython.com', first_name: 'Kenji', last_name: 'Sato', role_id: csAgentRole.id },
  ]
  const staffByName = new Map<string, string>()
  for (const s of staffSeeds) {
    let staffRow = await prisma.staff.findFirst({
      where: { user: { email: s.email } },
      select: { id: true },
    })
    if (!staffRow) {
      const user = await prisma.user.create({
        data: { type: 'staff', email: s.email, clerk_user_id: `user_${faker.string.alphanumeric(24)}` },
      })
      staffRow = await prisma.staff.create({
        data: { user_id: user.id, first_name: s.first_name, last_name: s.last_name, role_id: s.role_id },
        select: { id: true },
      })
    }
    staffByName.set(`${s.first_name} ${s.last_name}`, staffRow.id)
  }

  // Extra demo flights
  const flightFY308 = await prisma.flight.findFirst({ where: { flight_number: 'FY308' } })
  let flightFY308Id = flightFY308?.id
  if (!flightFY308Id) {
    const route = await prisma.route.findFirst()
    const aircraft = await prisma.aircraft.findFirst()
    if (route && aircraft) {
      const f = await prisma.flight.create({
        data: {
          flight_number: 'FY308',
          route_id: route.id,
          aircraft_id: aircraft.id,
          scheduled_dep_at: new Date('2026-10-12T08:00:00Z'),
          scheduled_arr_at: new Date('2026-10-12T14:00:00Z'),
          dep_at: new Date('2026-10-12T08:00:00Z'),
          arr_at: new Date('2026-10-12T14:00:00Z'),
          status: 'scheduled',
          service_date: new Date('2026-10-12'),
        },
      })
      flightFY308Id = f.id
    }
  }
  // A booking_segment points at its flight's seat_inventory row (flight_id, cabin), so the economy cabin must exist first.
  if (flightFY308Id) {
    await prisma.seat_inventory.upsert({
      where: { flight_id_cabin: { flight_id: flightFY308Id, cabin: 'economy' } },
      create: { flight_id: flightFY308Id, cabin: 'economy', capacity: 180 },
      update: {},
    })
  }

  // Demo customers and bookings
  const demoCustomers = [
    { email: 'somchai.w@example.com', first_name: 'Somchai', last_name: 'Wongsakul', booking_ref: 'FLY7K2' },
    { email: 'ananda.s@example.com', first_name: 'Ananda', last_name: 'Silva', booking_ref: 'K8N2P4' },
    { email: 'niran.k@example.com', first_name: 'Niran', last_name: 'Kittisup', booking_ref: 'M2R9Q3' },
    { email: 'anna.lee@example.com', first_name: 'Anna', last_name: 'Lee', booking_ref: 'W9X4B2' },
    { email: 'mai.t@example.com', first_name: 'Mai', last_name: 'Tran', booking_ref: 'C5D8J3' },
    { email: 'tom.b@example.com', first_name: 'Tom', last_name: 'Baker', booking_ref: 'R4V8Z3' },
    { email: 'david.chen@example.com', first_name: 'David', last_name: 'Chen', booking_ref: 'T6Y2M8' },
  ]
  for (const c of demoCustomers) {
    let customer = await prisma.customer.findFirst({
      where: { user: { email: c.email } },
      include: { passenger: true },
    })
    if (!customer) {
      const u = await prisma.user.create({ data: { type: 'customer', email: c.email } })
      const p = await prisma.passenger.create({ data: { first_name: c.first_name, last_name: c.last_name } })
      customer = await prisma.customer.create({
        data: { user_id: u.id, passenger_id: p.id },
        include: { passenger: true },
      })
    }
    const existingBooking = await prisma.booking.findUnique({ where: { booking_reference: c.booking_ref } })
    if (!existingBooking) {
      const b = await prisma.booking.create({
        data: {
          booking_reference: c.booking_ref,
          customer_id: customer.id,
          trip_type: 'one_way',
          status: 'confirmed',
          currency: 'USD',
          contact_email: c.email,
          idempotency_key: faker.string.uuid(),
          booked_at: new Date('2026-10-01T00:00:00Z'),
          hold_expires_at: new Date('2026-10-01T00:15:00Z'),
          // booking's CHECK requires confirmed_at exactly when status is confirmed or cancelled
          confirmed_at: new Date('2026-10-01T00:05:00Z'),
        },
      })
      await prisma.booking_passenger.create({
        data: { booking_id: b.id, passenger_id: customer.passenger_id, passenger_type: 'adult' },
      })
      if (flightFY308Id) {
        await prisma.booking_segment.create({
          data: { booking_id: b.id, flight_id: flightFY308Id, segment_order: 1, cabin: 'economy' },
        })
        // A confirmed booking holds a sold seat.
        await prisma.seat_inventory.update({
          where: { flight_id_cabin: { flight_id: flightFY308Id, cabin: 'economy' } },
          data: { sold_count: { increment: 1 } },
        })
      }
    }
  }

  // Demo guest bookings
  const guestBookings = [
    { booking_ref: 'P4LM8T', first_name: 'Somchai', last_name: 'Prasert', email: 's.prasert@example.com' },
    { booking_ref: 'H7L3N6', first_name: 'Kanda', last_name: 'Srisuk', email: 'kanda.s@example.com' },
  ]
  for (const g of guestBookings) {
    const existing = await prisma.booking.findUnique({ where: { booking_reference: g.booking_ref } })
    if (!existing) {
      const u = await prisma.user.create({ data: { type: 'customer', email: g.email } })
      const p = await prisma.passenger.create({ data: { first_name: g.first_name, last_name: g.last_name } })
      const c = await prisma.customer.create({ data: { user_id: u.id, passenger_id: p.id } })

      const b = await prisma.booking.create({
        data: {
          booking_reference: g.booking_ref,
          customer_id: c.id,
          trip_type: 'one_way',
          status: 'confirmed',
          currency: 'USD',
          contact_email: g.email,
          idempotency_key: faker.string.uuid(),
          booked_at: new Date('2026-10-01T00:00:00Z'),
          hold_expires_at: new Date('2026-10-01T00:15:00Z'),
          // booking's CHECK requires confirmed_at exactly when status is confirmed or cancelled
          confirmed_at: new Date('2026-10-01T00:05:00Z'),
        },
      })
      await prisma.booking_passenger.create({ data: { booking_id: b.id, passenger_id: p.id, passenger_type: 'adult' } })
      if (flightFY308Id) {
        await prisma.booking_segment.create({
          data: { booking_id: b.id, flight_id: flightFY308Id, segment_order: 1, cabin: 'economy' },
        })
        // A confirmed booking holds a sold seat.
        await prisma.seat_inventory.update({
          where: { flight_id_cabin: { flight_id: flightFY308Id, cabin: 'economy' } },
          data: { sold_count: { increment: 1 } },
        })
      }
    }
  }
}

async function main() {
  console.log(
    `Seeding ${STAFF_ROLES.length} roles, the Feature 2, 4, 5, 6, 10 and 11 demo data, ${CUSTOMER_COUNT} customers and ${STAFF_COUNT} staff...`,
  )

  const roleIds = await seedRoles()
  await seedFlightNetwork()
  await seedFlightSchedulingDemo()
  // Pricing first: its fare classes feed the loyalty earn rules, and its baggage override needs the routes above.
  await seedPricingSettings()
  await seedPricingCatalog()
  await seedCheckIn()
  await seedLostAndFound()
  await seedLoyalty()
  await seedCrewPay()

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const user = await seedCustomer()
    await seedRefreshTokens(user.id)
  }

  for (let i = 0; i < STAFF_COUNT; i++) {
    const user = await seedStaff(roleIds)
    await seedRefreshTokens(user.id)
  }

  await seedCustomerService()
  await seedCurrencyRates()

  console.log('Seeding complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
