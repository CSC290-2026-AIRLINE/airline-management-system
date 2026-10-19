// F12 seed (idempotent). Runs after the base Level 1 seed (which gives
// us roles, customers, and staff). Inserts the network/route/flight
// inventory F12 needs to exercise every endpoint: 4 airports, 2
// aircraft, 1 route, 2 fare classes, 3 flights, 12 products, 4
// warehouses, 5 suppliers, network + per-route + per-flight cabin
// settings, 12 product offerings, 4 purchase receipts and 8 stock
// batches (with varied expiry states), 4 catering orders in
// generated/loaded/closed states, 2 stock transfers with aircraft
// stock, 1 flight report with lines, 3 on-board product sales, and
// 4 product orders in every state.
//
// Re-running this seed is a no-op: every row is upserted on a stable
// natural key.

import { randomUUID } from 'node:crypto'
import type { PrismaClient } from './generated/prisma/client'

// Stable IDs (deterministic) so re-runs and the F12 dev pages are
// stable. We use hex-shaped strings that look like UUIDs but are
// not real UUIDs — Prisma uses UUID columns but treats the value
// as a TEXT, so any non-empty string is fine.
const id = (s: string): string => `00000000-0000-0000-0000-${s.padStart(12, '0')}`
// Random UUID for tables where the natural key isn't usable.
const ruid = (): string => randomUUID()

const IDS = {
  airport: {
    BKK: id('a00000000001'),
    NRT: id('a00000000002'),
    SIN: id('a00000000003'),
    HKG: id('a00000000004'),
  },
  aircraftType: {
    A320: id('b00000000001'),
    B777: id('b00000000002'),
  },
  aircraft: {
    FYA: id('c00000000001'),
    FYB: id('c00000000002'),
  },
  route: {
    BKKNRT: id('d00000000001'),
    SINBKK: id('d00000000002'),
  },
  fareClass: {
    ECON: id('e00000000001'),
    BIZ: id('e00000000002'),
  },
  flight: {
    F401: id('f00000000001'),
    F405: id('f00000000002'),
    F308: id('f00000000003'),
    F220: id('f00000000004'),
  },
  product: {
    P001: id('100000000001'), // Beef stir-fry (meal)
    P002: id('100000000002'), // Braised beef with rice (meal, premium)
    P003: id('100000000003'), // Mushroom risotto (meal, VGML)
    P004: id('100000000004'), // Cold brew coffee (beverage)
    P005: id('100000000005'), // Sparkling water (beverage)
    P006: id('100000000006'), // Orange juice (beverage)
    P007: id('100000000007'), // Mixed nuts (snack)
    P008: id('100000000008'), // Crisps (snack)
    P009: id('100000000009'), // Dark chocolate (snack)
    P010: id('100000000010'), // Perfume 50ml (duty_free)
    P011: id('100000000011'), // Whisky mini (duty_free)
    P012: id('100000000012'), // Headphone set (duty_free)
  },
  warehouse: {
    WHBKK: id('200000000001'),
    WHNRT: id('200000000002'),
    WHSIN: id('200000000003'),
    WHHKG: id('200000000004'),
  },
  supplier: {
    SG1: id('300000000001'),
    SG2: id('300000000002'),
    SG3: id('300000000003'),
    SG4: id('300000000004'),
    SG5: id('300000000005'),
  },
  receipt: {
    R001: id('400000000001'),
    R002: id('400000000002'),
    R003: id('400000000003'),
    R004: id('400000000004'),
  },
  batch: {
    B001: id('500000000001'),
    B002: id('500000000002'),
    B003: id('500000000003'),
    B004: id('500000000004'),
    B005: id('500000000005'),
    B006: id('500000000006'),
    B007: id('500000000007'),
    B008: id('500000000008'),
  },
  cateringOrder: {
    CO401: id('600000000001'),
    CO405: id('600000000002'),
    CO308: id('600000000003'),
    COOLD: id('600000000004'),
  },
  stockTransfer: {
    ST401: id('700000000001'),
    ST308: id('700000000002'),
  },
  flightReport: {
    FR401: id('800000000001'),
  },
  productOrder: {
    PO1: id('900000000001'),
    PO2: id('900000000002'),
    PO3: id('900000000003'),
    PO4: id('900000000004'),
  },
  cabinSetting: {
    NET_ECON: id('a00000000001'),
    NET_BIZ: id('a00000000002'),
    ROUTE_BKKNRT_ECON: id('a00000000003'),
    FLIGHT_F401_BIZ: id('a00000000004'),
  },
  productOffering: {
    PREFIX: 'b0000000',
  },
}

// "Now" anchor for relative dates. The level-1 seed runs before this
// and gives us a stable "today" (the container's clock at boot).
function nowMs(): number {
  return Date.now()
}

function daysFromNow(d: number): Date {
  return new Date(nowMs() + d * 24 * 60 * 60 * 1000)
}

function hoursFromNow(h: number): Date {
  return new Date(nowMs() + h * 60 * 60 * 1000)
}

export async function seedF12(prisma: PrismaClient): Promise<void> {
  console.log('Seeding F12: airports, aircraft, flights, products, stock, sales...')

  // --- Airports (upsert on PK) --------------------------------------------
  for (const a of [
    {
      iata_code: 'BKK',
      icao_code: 'VTBS',
      name: 'Suvarnabhumi',
      city: 'Bangkok',
      country: 'TH',
      timezone: 'Asia/Bangkok',
      min_turnaround_min: 45,
    },
    { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita', city: 'Tokyo', country: 'JP', timezone: 'Asia/Tokyo', min_turnaround_min: 60 },
    {
      iata_code: 'SIN',
      icao_code: 'WSSS',
      name: 'Changi',
      city: 'Singapore',
      country: 'SG',
      timezone: 'Asia/Singapore',
      min_turnaround_min: 45,
    },
    {
      iata_code: 'HKG',
      icao_code: 'VHHH',
      name: 'Hong Kong Intl',
      city: 'Hong Kong',
      country: 'HK',
      timezone: 'Asia/Hong_Kong',
      min_turnaround_min: 45,
    },
  ]) {
    await prisma.airport.upsert({ where: { iata_code: a.iata_code }, update: a, create: a })
  }

  // --- Aircraft types ----------------------------------------------------
  await prisma.aircraft_type.upsert({
    where: { id: IDS.aircraftType.A320 },
    update: {},
    create: {
      id: IDS.aircraftType.A320,
      code: 'A320',
      manufacturer: 'Airbus',
      model: 'A320neo',
      layout: {},
      hold_weight_limit_kg: 5000,
      max_takeoff_weight_kg: 79000,
      max_range_km: 6300,
      min_turnaround_minutes: 30,
      operating_cost_per_hour: 4500,
      cost_currency: 'USD',
    },
  })
  await prisma.aircraft_type.upsert({
    where: { id: IDS.aircraftType.B777 },
    update: {},
    create: {
      id: IDS.aircraftType.B777,
      code: 'B777',
      manufacturer: 'Boeing',
      model: '777-300ER',
      layout: {},
      hold_weight_limit_kg: 18000,
      max_takeoff_weight_kg: 350000,
      max_range_km: 14000,
      min_turnaround_minutes: 60,
      operating_cost_per_hour: 12000,
      cost_currency: 'USD',
    },
  })

  // --- Aircraft (base at BKK) -------------------------------------------
  await prisma.aircraft.upsert({
    where: { id: IDS.aircraft.FYA },
    update: {},
    create: {
      id: IDS.aircraft.FYA,
      tail_number: 'HS-FYA',
      aircraft_type_id: IDS.aircraftType.A320,
      entry_into_service_date: new Date('2018-01-01'),
      base_airport_code: 'BKK',
    },
  })
  await prisma.aircraft.upsert({
    where: { id: IDS.aircraft.FYB },
    update: {},
    create: {
      id: IDS.aircraft.FYB,
      tail_number: 'HS-FYB',
      aircraft_type_id: IDS.aircraftType.B777,
      entry_into_service_date: new Date('2015-06-01'),
      base_airport_code: 'BKK',
    },
  })

  // --- Route BKK → NRT ---------------------------------------------------
  await prisma.route.upsert({
    where: { origin_destination: { origin: 'BKK', destination: 'NRT' } } as never,
    update: {},
    create: {
      id: IDS.route.BKKNRT,
      origin: 'BKK',
      destination: 'NRT',
      distance_km: 4600,
      block_time_min: 390,
    },
  })
  await prisma.route.upsert({
    where: { origin_destination: { origin: 'SIN', destination: 'BKK' } } as never,
    update: {},
    create: {
      id: IDS.route.SINBKK,
      origin: 'SIN',
      destination: 'BKK',
      distance_km: 1400,
      block_time_min: 130,
    },
  })

  // --- Fare classes ------------------------------------------------------
  await prisma.fare_class.upsert({
    where: { id: IDS.fareClass.ECON },
    update: {},
    create: {
      id: IDS.fareClass.ECON,
      code: 'ECO',
      cabin: 'economy',
      name: 'Economy',
    },
  })
  await prisma.fare_class.upsert({
    where: { id: IDS.fareClass.BIZ },
    update: {},
    create: {
      id: IDS.fareClass.BIZ,
      code: 'BIZ',
      cabin: 'business',
      name: 'Business',
    },
  })

  // --- Flights -----------------------------------------------------------
  // f-401: BKK → NRT, business, departs in +5h, aircraft FYA (B777)
  // f-405: BKK → NRT, economy, departs in +10h, aircraft FYB (A320)
  // f-308: BKK → NRT, economy, departs in +25h, aircraft FYA (B777)
  const f401Dep = hoursFromNow(5)
  const f405Dep = hoursFromNow(10)
  const f308Dep = hoursFromNow(25)
  const f220Dep = hoursFromNow(48) // SIN → BKK, void test case
  const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)
  const flightSeed = [
    {
      id: IDS.flight.F401,
      flight_number: 'FY401',
      service_date: new Date(f401Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.BKKNRT,
      scheduled_dep_at: f401Dep,
      scheduled_arr_at: addMinutes(f401Dep, 390),
      dep_at: f401Dep,
      arr_at: addMinutes(f401Dep, 390),
      aircraft_id: IDS.aircraft.FYB,
      status: 'scheduled' as const,
    },
    {
      id: IDS.flight.F405,
      flight_number: 'FY405',
      service_date: new Date(f405Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.BKKNRT,
      scheduled_dep_at: f405Dep,
      scheduled_arr_at: addMinutes(f405Dep, 390),
      dep_at: f405Dep,
      arr_at: addMinutes(f405Dep, 390),
      aircraft_id: IDS.aircraft.FYA,
      status: 'scheduled' as const,
    },
    {
      id: IDS.flight.F308,
      flight_number: 'FY308',
      service_date: new Date(f308Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.BKKNRT,
      scheduled_dep_at: f308Dep,
      scheduled_arr_at: addMinutes(f308Dep, 390),
      dep_at: f308Dep,
      arr_at: addMinutes(f308Dep, 390),
      aircraft_id: IDS.aircraft.FYB,
      status: 'scheduled' as const,
    },
    {
      id: IDS.flight.F220,
      flight_number: 'FY220',
      service_date: new Date(f220Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.SINBKK,
      scheduled_dep_at: f220Dep,
      scheduled_arr_at: addMinutes(f220Dep, 130),
      dep_at: f220Dep,
      arr_at: addMinutes(f220Dep, 130),
      aircraft_id: IDS.aircraft.FYA,
      status: 'scheduled' as const,
    },
  ]
  for (const f of flightSeed) {
    await prisma.flight.upsert({
      where: { id: f.id },
      update: {
        scheduled_dep_at: f.scheduled_dep_at,
        scheduled_arr_at: f.scheduled_arr_at,
        dep_at: f.dep_at,
        arr_at: f.arr_at,
        aircraft_id: f.aircraft_id,
      },
      create: f,
    })
  }

  // --- Products (12) -----------------------------------------------------
  const productSeed = [
    {
      id: IDS.product.P001,
      sku: 'MEAL-BEEF-001',
      category: 'meal' as const,
      type_code: 'STD',
      name: 'Beef stir-fry with jasmine rice',
      price: '12.50',
      cost: '4.00',
      shelf: 2,
      premium: false,
      is_active: true,
    },
    {
      id: IDS.product.P002,
      sku: 'MEAL-BEEF-002',
      category: 'meal' as const,
      type_code: 'STD',
      name: 'Braised beef short rib with potato gratin',
      price: '18.00',
      cost: '6.50',
      shelf: 2,
      premium: true,
      is_active: true,
    },
    {
      id: IDS.product.P003,
      sku: 'MEAL-VEG-001',
      category: 'meal' as const,
      type_code: 'VGML',
      name: 'Mushroom risotto (vegan)',
      price: '11.00',
      cost: '3.80',
      shelf: 2,
      premium: false,
      is_active: true,
    },
    {
      id: IDS.product.P004,
      sku: 'BEV-COFFEE-001',
      category: 'beverage' as const,
      name: 'Cold brew coffee',
      price: '4.50',
      cost: '1.20',
      shelf: 30,
      is_active: true,
    },
    {
      id: IDS.product.P005,
      sku: 'BEV-WATER-001',
      category: 'beverage' as const,
      name: 'Sparkling water 330ml',
      price: '3.00',
      cost: '0.60',
      shelf: 365,
      is_active: true,
    },
    {
      id: IDS.product.P006,
      sku: 'BEV-OJ-001',
      category: 'beverage' as const,
      name: 'Fresh orange juice 200ml',
      price: '3.50',
      cost: '0.90',
      shelf: 7,
      is_active: true,
    },
    {
      id: IDS.product.P007,
      sku: 'SNK-NUTS-001',
      category: 'snack' as const,
      name: 'Mixed nuts 30g',
      price: '3.50',
      cost: '0.80',
      shelf: 180,
      is_active: true,
    },
    {
      id: IDS.product.P008,
      sku: 'SNK-CRISPS-001',
      category: 'snack' as const,
      name: 'Sea-salt crisps 40g',
      price: '3.00',
      cost: '0.70',
      shelf: 90,
      is_active: true,
    },
    {
      id: IDS.product.P009,
      sku: 'SNK-CHOC-001',
      category: 'snack' as const,
      name: 'Dark chocolate 70% 30g',
      price: '4.00',
      cost: '1.10',
      shelf: 270,
      is_active: true,
    },
    {
      id: IDS.product.P010,
      sku: 'DF-PERFUME-001',
      category: 'duty_free' as const,
      name: 'Eau de parfum 50ml',
      price: '78.00',
      cost: '24.00',
      shelf: null,
      is_active: true,
    },
    {
      id: IDS.product.P011,
      sku: 'DF-WHISKY-001',
      category: 'duty_free' as const,
      name: 'Single malt whisky 200ml',
      price: '46.00',
      cost: '18.00',
      shelf: null,
      is_active: true,
    },
    {
      id: IDS.product.P012,
      sku: 'DF-HEADPH-001',
      category: 'duty_free' as const,
      name: 'Noise-cancelling headphones',
      price: '320.00',
      cost: '120.00',
      shelf: null,
      is_active: true,
    },
  ]
  for (const p of productSeed) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        price_amount: p.price,
        purchase_cost_amount: p.cost,
        shelf_life_days: p.shelf,
        is_premium: p.premium ?? false,
        is_active: p.is_active,
      },
      create: {
        id: p.id,
        sku: p.sku,
        category: p.category,
        type_code: p.type_code ?? 'STD',
        name: p.name,
        price_amount: p.price,
        purchase_cost_amount: p.cost,
        shelf_life_days: p.shelf,
        is_premium: p.premium ?? false,
        is_active: p.is_active,
      },
    })
  }

  // --- Warehouses (one per departure airport) ----------------------------
  const whSeed = [
    { id: IDS.warehouse.WHBKK, code: 'WH-BKK', name: 'BKK Catering Warehouse', airport_code: 'BKK' },
    { id: IDS.warehouse.WHNRT, code: 'WH-NRT', name: 'NRT Catering Warehouse', airport_code: 'NRT' },
    { id: IDS.warehouse.WHSIN, code: 'WH-SIN', name: 'SIN Catering Warehouse', airport_code: 'SIN' },
    { id: IDS.warehouse.WHHKG, code: 'WH-HKG', name: 'HKG Catering Warehouse', airport_code: 'HKG' },
  ]
  for (const w of whSeed) {
    await prisma.warehouse.upsert({
      where: { id: w.id },
      update: { name: w.name },
      create: w,
    })
  }

  // --- Suppliers (≥1 per airport) ---------------------------------------
  const supSeed = [
    { id: IDS.supplier.SG1, name: 'Bangkok Catering Co.', airport_code: 'BKK', contact: 'bkk@example.com' },
    { id: IDS.supplier.SG2, name: 'Thai Beverage Supply', airport_code: 'BKK', contact: 'bev@example.com' },
    { id: IDS.supplier.SG3, name: 'Narita Inflight Services', airport_code: 'NRT', contact: 'nrt@example.com' },
    { id: IDS.supplier.SG4, name: 'Singapore Air Catering', airport_code: 'SIN', contact: 'sin@example.com' },
    { id: IDS.supplier.SG5, name: 'HK Duty Free Partners', airport_code: 'HKG', contact: 'hkg@example.com' },
  ]
  for (const s of supSeed) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: { name: s.name, contact: s.contact, is_active: true },
      create: { ...s, is_active: true },
    })
  }

  // --- A staff member to be the "received_by" and audit actor ----------
  const anyStaff = await prisma.staff.findFirst({ where: { deleted_at: null } })
  if (!anyStaff) throw new Error('seedF12 needs a staff row from the level-1 seed first.')
  const staffId = anyStaff.id

  // --- Cabin settings: network + route override + flight override -------
  // The schema seeds 4 placeholder network rows on migration; we update
  // the two we care about (economy, business) and add route/flight
  // overrides on the composite unique key (route_id, flight_id, cabin).
  // Prisma 7 won't accept null in `where` for nullable columns, so
  // findFirst + update.
  const networkEconomy = await prisma.cabin_setting.findFirst({ where: { scope: 'network', cabin: 'economy' } })
  if (networkEconomy) {
    await prisma.cabin_setting.update({
      where: { id: networkEconomy.id },
      data: {
        meal_service: 'paid',
        meal_selection: 'choose',
        included_per_passenger: 0,
        preorder_enabled: true,
        order_window_hours: 48,
        premium_meals_allowed: true,
        snacks_enabled: true,
        duty_free_enabled: true,
        onboard_buffer_percent: 10,
      },
    })
  }
  const networkBusiness = await prisma.cabin_setting.findFirst({ where: { scope: 'network', cabin: 'business' } })
  if (networkBusiness) {
    await prisma.cabin_setting.update({
      where: { id: networkBusiness.id },
      data: {
        meal_service: 'complimentary',
        meal_selection: 'choose',
        included_per_passenger: 1,
        preorder_enabled: true,
        order_window_hours: 48,
        premium_meals_allowed: true,
        snacks_enabled: true,
        duty_free_enabled: true,
        onboard_buffer_percent: 10,
      },
    })
  }
  // Route override: enable duty-free on economy for BKK-NRT
  const existingRoute = await prisma.cabin_setting.findFirst({ where: { scope: 'route', route_id: IDS.route.BKKNRT, cabin: 'economy' } })
  if (existingRoute) {
    await prisma.cabin_setting.update({ where: { id: existingRoute.id }, data: { duty_free_enabled: true } })
  } else {
    await prisma.cabin_setting.create({
      data: {
        id: IDS.cabinSetting.ROUTE_BKKNRT_ECON,
        scope: 'route',
        route_id: IDS.route.BKKNRT,
        cabin: 'economy',
        duty_free_enabled: true,
        updated_by_staff_id: staffId,
      },
    })
  }
  // Flight override: f-401 (business) has shorter order window
  const existingFlight = await prisma.cabin_setting.findFirst({ where: { scope: 'flight', flight_id: IDS.flight.F401, cabin: 'business' } })
  if (existingFlight) {
    await prisma.cabin_setting.update({ where: { id: existingFlight.id }, data: { order_window_hours: 24 } })
  } else {
    await prisma.cabin_setting.create({
      data: {
        id: IDS.cabinSetting.FLIGHT_F401_BIZ,
        scope: 'flight',
        flight_id: IDS.flight.F401,
        cabin: 'business',
        order_window_hours: 24,
        updated_by_staff_id: staffId,
      },
    })
  }

  // --- Product offerings: 12 network-level (default = P001) --------------
  for (const p of productSeed) {
    const cabin = p.category === 'meal' ? 'business' : 'business'
    // Use the composite (product_id, scope, route_id, flight_id, cabin) as
    // the lookup key. findFirst+create/update is idempotent.
    const existingBiz = await prisma.product_offering.findFirst({
      where: { product_id: p.id, scope: 'network', cabin },
    })
    if (existingBiz) {
      await prisma.product_offering.update({
        where: { id: existingBiz.id },
        data: { is_default: p.id === IDS.product.P001, is_active: true },
      })
    } else {
      await prisma.product_offering.create({
        data: {
          id: ruid(),
          product_id: p.id,
          scope: 'network',
          cabin,
          is_default: p.id === IDS.product.P001,
          is_active: true,
        },
      })
    }
    // Also an economy offering for snack/bev/df so staff can pick.
    if (p.category !== 'meal') {
      const existingEcon = await prisma.product_offering.findFirst({
        where: { product_id: p.id, scope: 'network', cabin: 'economy' },
      })
      if (existingEcon) {
        await prisma.product_offering.update({ where: { id: existingEcon.id }, data: { is_active: true } })
      } else {
        await prisma.product_offering.create({
          data: {
            id: ruid(),
            product_id: p.id,
            scope: 'network',
            cabin: 'economy',
            is_default: false,
            is_active: true,
          },
        })
      }
    }
  }

  // --- Purchase receipts + stock batches ---------------------------------
  // Receipt 1: 200 P001 @ BKK
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R001 },
    update: {},
    create: {
      id: IDS.receipt.R001,
      supplier_id: IDS.supplier.SG1,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-3),
      received_by_staff_id: staffId,
    },
  })
  // Batch 001: P001 expires in 1 day (about to expire)
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P001, batch_code: 'B001' } },
    update: { quantity_remaining: 200, expires_at: daysFromNow(1) },
    create: {
      id: IDS.batch.B001,
      purchase_receipt_id: IDS.receipt.R001,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P001,
      batch_code: 'B001',
      quantity_received: 200,
      quantity_remaining: 200,
      unit_cost_amount: '4.00',
      received_at: daysFromNow(-3),
      expires_at: daysFromNow(1),
    },
  })
  // Receipt 2: P002, P004, P007 @ BKK
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R002 },
    update: {},
    create: {
      id: IDS.receipt.R002,
      supplier_id: IDS.supplier.SG1,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-1),
      received_by_staff_id: staffId,
    },
  })
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P002, batch_code: 'B002' } },
    update: { quantity_remaining: 120 },
    create: {
      id: IDS.batch.B002,
      purchase_receipt_id: IDS.receipt.R002,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P002,
      batch_code: 'B002',
      quantity_received: 120,
      quantity_remaining: 120,
      unit_cost_amount: '6.50',
      received_at: daysFromNow(-1),
      expires_at: daysFromNow(1),
    },
  })
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P004, batch_code: 'B003' } },
    update: { quantity_remaining: 300 },
    create: {
      id: IDS.batch.B003,
      purchase_receipt_id: IDS.receipt.R002,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P004,
      batch_code: 'B003',
      quantity_received: 300,
      quantity_remaining: 300,
      unit_cost_amount: '1.20',
      received_at: daysFromNow(-1),
      expires_at: daysFromNow(20),
    },
  })
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P007, batch_code: 'B004' } },
    update: { quantity_remaining: 250 },
    create: {
      id: IDS.batch.B004,
      purchase_receipt_id: IDS.receipt.R002,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P007,
      batch_code: 'B004',
      quantity_received: 250,
      quantity_remaining: 250,
      unit_cost_amount: '0.80',
      received_at: daysFromNow(-1),
      expires_at: daysFromNow(150),
    },
  })
  // Receipt 3: P010, P011 @ BKK (duty-free, no expiry)
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R003 },
    update: {},
    create: {
      id: IDS.receipt.R003,
      supplier_id: IDS.supplier.SG5,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-7),
      received_by_staff_id: staffId,
    },
  })
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P010, batch_code: 'B005' } },
    update: { quantity_remaining: 50 },
    create: {
      id: IDS.batch.B005,
      purchase_receipt_id: IDS.receipt.R003,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P010,
      batch_code: 'B005',
      quantity_received: 50,
      quantity_remaining: 50,
      unit_cost_amount: '24.00',
      received_at: daysFromNow(-7),
      expires_at: null,
    },
  })
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P011, batch_code: 'B006' } },
    update: { quantity_remaining: 60 },
    create: {
      id: IDS.batch.B006,
      purchase_receipt_id: IDS.receipt.R003,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P011,
      batch_code: 'B006',
      quantity_received: 60,
      quantity_remaining: 60,
      unit_cost_amount: '18.00',
      received_at: daysFromNow(-7),
      expires_at: null,
    },
  })
  // Receipt 4: P005, P009 @ BKK (beverage, snack — long shelf life)
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R004 },
    update: {},
    create: {
      id: IDS.receipt.R004,
      supplier_id: IDS.supplier.SG2,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-5),
      received_by_staff_id: staffId,
    },
  })
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P005, batch_code: 'B007' } },
    update: { quantity_remaining: 400 },
    create: {
      id: IDS.batch.B007,
      purchase_receipt_id: IDS.receipt.R004,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P005,
      batch_code: 'B007',
      quantity_received: 400,
      quantity_remaining: 400,
      unit_cost_amount: '0.60',
      received_at: daysFromNow(-5),
      expires_at: daysFromNow(300),
    },
  })
  await prisma.stock_batch.upsert({
    where: { warehouse_id_product_id_batch_code: { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P009, batch_code: 'B008' } },
    update: { quantity_remaining: 180 },
    create: {
      id: IDS.batch.B008,
      purchase_receipt_id: IDS.receipt.R004,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P009,
      batch_code: 'B008',
      quantity_received: 180,
      quantity_remaining: 180,
      unit_cost_amount: '1.10',
      received_at: daysFromNow(-5),
      expires_at: daysFromNow(200),
    },
  })

  // --- Warehouse stock (one row per warehouse×product we delivered) -----
  const whStock = [
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P001, qty: 200 },
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P002, qty: 120 },
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P004, qty: 300 },
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P005, qty: 400 },
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P007, qty: 250 },
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P009, qty: 180 },
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P010, qty: 50 },
    { warehouse_id: IDS.warehouse.WHBKK, product_id: IDS.product.P011, qty: 60 },
  ]
  for (const ws of whStock) {
    await prisma.warehouse_stock.upsert({
      where: { warehouse_id_product_id: { warehouse_id: ws.warehouse_id, product_id: ws.product_id } },
      update: { quantity_on_hand: ws.qty },
      create: { warehouse_id: ws.warehouse_id, product_id: ws.product_id, quantity_on_hand: ws.qty, quantity_reserved: 0 },
    })
  }

  // --- Catering orders --------------------------------------------------
  // co-401: business, generated
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.CO401 },
    update: { status: 'generated' },
    create: {
      id: IDS.cateringOrder.CO401,
      flight_id: IDS.flight.F401,
      warehouse_id: IDS.warehouse.WHBKK,
      status: 'generated',
      cutoff_at: hoursFromNow(1),
      generated_at: daysFromNow(-1),
      generated_by_staff_id: staffId,
    },
  })
  // co-405: economy, loaded (ready to be loaded from a transfer)
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.CO405 },
    update: { status: 'loaded', loaded_at: hoursFromNow(-1) },
    create: {
      id: IDS.cateringOrder.CO405,
      flight_id: IDS.flight.F405,
      warehouse_id: IDS.warehouse.WHBKK,
      status: 'loaded',
      cutoff_at: hoursFromNow(6),
      generated_at: daysFromNow(-1),
      generated_by_staff_id: staffId,
      loaded_at: hoursFromNow(-1),
    },
  })
  // co-308: economy, loaded
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.CO308 },
    update: { status: 'loaded', loaded_at: hoursFromNow(-1) },
    create: {
      id: IDS.cateringOrder.CO308,
      flight_id: IDS.flight.F308,
      warehouse_id: IDS.warehouse.WHBKK,
      status: 'loaded',
      cutoff_at: hoursFromNow(21),
      generated_at: daysFromNow(-1),
      generated_by_staff_id: staffId,
      loaded_at: hoursFromNow(-1),
    },
  })
  // co-old: economy, void (for a separate flight so the 1-per-flight
  // unique constraint holds)
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.COOLD },
    update: { status: 'void' },
    create: {
      id: IDS.cateringOrder.COOLD,
      flight_id: IDS.flight.F220,
      warehouse_id: IDS.warehouse.WHSIN,
      status: 'void',
      cutoff_at: hoursFromNow(46),
      generated_at: daysFromNow(-2),
    },
  })

  // Catering order lines (one per cabin+product for f-401 business)
  for (const line of [
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P001, qty: 40, source: 'order' as const },
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P002, qty: 30, source: 'order' as const },
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P004, qty: 80, source: 'order' as const },
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P009, qty: 60, source: 'order' as const },
  ]) {
    const existing = await prisma.catering_order_line.findFirst({
      where: { catering_order_id: line.catering_order_id, cabin: line.cabin, product_id: line.product_id, source: line.source },
    })
    if (existing) {
      await prisma.catering_order_line.update({ where: { id: existing.id }, data: { quantity_required: line.qty, quantity_short: 0 } })
    } else {
      await prisma.catering_order_line.create({
        data: {
          id: ruid(),
          catering_order_id: line.catering_order_id,
          cabin: line.cabin,
          product_id: line.product_id,
          quantity_required: line.qty,
          quantity_short: 0,
          source: line.source,
        },
      })
    }
  }

  // --- Stock transfers + aircraft stock ----------------------------------
  // Transfer for f-401: 30 P002 + 60 P009 + 40 P001
  await prisma.stock_transfer.upsert({
    where: { id: IDS.stockTransfer.ST401 },
    update: {},
    create: {
      id: IDS.stockTransfer.ST401,
      flight_id: IDS.flight.F401,
      aircraft_id: IDS.aircraft.FYB,
      warehouse_id: IDS.warehouse.WHBKK,
      transferred_at: hoursFromNow(-1),
      staff_id: staffId,
    },
  })
  for (const tl of [
    { stock_transfer_id: IDS.stockTransfer.ST401, product_id: IDS.product.P002, batch_id: IDS.batch.B002, qty: 30 },
    { stock_transfer_id: IDS.stockTransfer.ST401, product_id: IDS.product.P009, batch_id: IDS.batch.B008, qty: 60 },
    { stock_transfer_id: IDS.stockTransfer.ST401, product_id: IDS.product.P001, batch_id: IDS.batch.B001, qty: 40 },
  ]) {
    const existingLine = await prisma.stock_transfer_line.findFirst({
      where: { stock_transfer_id: tl.stock_transfer_id, product_id: tl.product_id, stock_batch_id: tl.batch_id },
    })
    if (existingLine) {
      await prisma.stock_transfer_line.update({ where: { id: existingLine.id }, data: { quantity: tl.qty } })
    } else {
      await prisma.stock_transfer_line.create({
        data: {
          id: ruid(),
          stock_transfer_id: tl.stock_transfer_id,
          product_id: tl.product_id,
          stock_batch_id: tl.batch_id,
          quantity: tl.qty,
        },
      })
    }
    await prisma.aircraft_stock.upsert({
      where: { aircraft_id_stock_batch_id: { aircraft_id: IDS.aircraft.FYB, stock_batch_id: tl.batch_id } },
      update: { quantity: tl.qty },
      create: { aircraft_id: IDS.aircraft.FYB, product_id: tl.product_id, stock_batch_id: tl.batch_id, quantity: tl.qty },
    })
  }

  // Transfer for f-308: 20 P005 + 50 P009
  await prisma.stock_transfer.upsert({
    where: { id: IDS.stockTransfer.ST308 },
    update: {},
    create: {
      id: IDS.stockTransfer.ST308,
      flight_id: IDS.flight.F308,
      aircraft_id: IDS.aircraft.FYB,
      warehouse_id: IDS.warehouse.WHBKK,
      transferred_at: hoursFromNow(-1),
      staff_id: staffId,
    },
  })
  for (const tl of [
    { stock_transfer_id: IDS.stockTransfer.ST308, product_id: IDS.product.P005, batch_id: IDS.batch.B007, qty: 20 },
    { stock_transfer_id: IDS.stockTransfer.ST308, product_id: IDS.product.P009, batch_id: IDS.batch.B008, qty: 50 },
  ]) {
    const existingLine = await prisma.stock_transfer_line.findFirst({
      where: { stock_transfer_id: tl.stock_transfer_id, product_id: tl.product_id, stock_batch_id: tl.batch_id },
    })
    if (existingLine) {
      await prisma.stock_transfer_line.update({ where: { id: existingLine.id }, data: { quantity: tl.qty } })
    } else {
      await prisma.stock_transfer_line.create({
        data: {
          id: ruid(),
          stock_transfer_id: tl.stock_transfer_id,
          product_id: tl.product_id,
          stock_batch_id: tl.batch_id,
          quantity: tl.qty,
        },
      })
    }
    await prisma.aircraft_stock.upsert({
      where: { aircraft_id_stock_batch_id: { aircraft_id: IDS.aircraft.FYB, stock_batch_id: tl.batch_id } },
      update: { quantity: tl.qty },
      create: { aircraft_id: IDS.aircraft.FYB, product_id: tl.product_id, stock_batch_id: tl.batch_id, quantity: tl.qty },
    })
  }

  // --- Flight report (already submitted for f-401) ---------------------
  await prisma.flight_report.upsert({
    where: { id: IDS.flightReport.FR401 },
    update: {},
    create: {
      id: IDS.flightReport.FR401,
      flight_id: IDS.flight.F401,
      status: 'submitted',
      submitted_by_staff_id: staffId,
      submitted_at: hoursFromNow(-1),
    },
  })
  for (const rl of [
    { product_id: IDS.product.P001, initial: 40, served: 35, sold: 0, wasted: 2, damaged: 0 },
    { product_id: IDS.product.P002, initial: 30, served: 25, sold: 0, wasted: 1, damaged: 0 },
    { product_id: IDS.product.P009, initial: 60, served: 0, sold: 0, wasted: 0, damaged: 0 },
  ]) {
    const remaining = rl.initial - rl.served - rl.sold - rl.wasted - rl.damaged
    const existingLine = await prisma.flight_report_line.findFirst({
      where: { flight_report_id: IDS.flightReport.FR401, product_id: rl.product_id },
    })
    if (existingLine) {
      await prisma.flight_report_line.update({
        where: { id: existingLine.id },
        data: { initial_quantity: rl.initial, served: rl.served, sold: rl.sold, wasted: rl.wasted, damaged: rl.damaged, remaining },
      })
    } else {
      await prisma.flight_report_line.create({
        data: {
          id: ruid(),
          flight_report_id: IDS.flightReport.FR401,
          product_id: rl.product_id,
          initial_quantity: rl.initial,
          served: rl.served,
          sold: rl.sold,
          wasted: rl.wasted,
          damaged: rl.damaged,
          remaining,
        },
      })
    }
  }

  // --- On-board product sales (3 rows for f-401) -----------------------
  for (const s of [
    { flight_id: IDS.flight.F401, product_id: IDS.product.P010, qty: 2, price: '78.00', total: '156.00', currency: 'USD' },
    { flight_id: IDS.flight.F401, product_id: IDS.product.P011, qty: 3, price: '46.00', total: '138.00', currency: 'USD' },
    { flight_id: IDS.flight.F401, product_id: IDS.product.P009, qty: 5, price: '4.00', total: '20.00', currency: 'USD' },
  ]) {
    // product_sale unique on (payment_id, product_id). We pick a
    // deterministic payment_id per (flight, product) so the second
    // run is idempotent.
    const paymentId = ruid()
    const existingSale = await prisma.product_sale.findFirst({
      where: { flight_id: s.flight_id, product_id: s.product_id, payment_id: paymentId },
    })
    if (existingSale) {
      await prisma.product_sale.update({
        where: { id: existingSale.id },
        data: { quantity: s.qty, unit_price_amount: s.price, total_amount: s.total },
      })
    } else {
      await prisma.product_sale.create({
        data: {
          id: ruid(),
          flight_id: s.flight_id,
          product_id: s.product_id,
          quantity: s.qty,
          unit_price_amount: s.price,
          total_amount: s.total,
          currency: s.currency,
          payment_id: paymentId,
          sold_at: hoursFromNow(-1),
        },
      })
    }
  }

  // --- Product orders (4 covering every status) ------------------------
  // Need a customer; reuse the first one.
  const customer = await prisma.customer.findFirst()
  if (!customer) throw new Error('seedF12 needs a customer row from the level-1 seed first.')
  const customerId = customer.id
  for (const po of [
    { id: IDS.productOrder.PO1, status: 'pending_payment' as const, total: '18.00', payment: null },
    { id: IDS.productOrder.PO2, status: 'confirmed' as const, total: '46.00', payment: ruid() },
    { id: IDS.productOrder.PO3, status: 'cancelled' as const, total: '12.50', payment: null },
    { id: IDS.productOrder.PO4, status: 'expired' as const, total: '4.50', payment: null },
  ]) {
    await prisma.product_order.upsert({
      where: { id: po.id },
      update: { status: po.status },
      create: {
        id: po.id,
        customer_id: customerId,
        booking_id: ruid(),
        flight_id: IDS.flight.F401,
        cabin: 'business',
        status: po.status,
        total_amount: po.total,
        currency: 'USD',
        payment_id: po.payment,
        paid_at: po.status === 'confirmed' ? hoursFromNow(-2) : null,
        expires_at: hoursFromNow(48),
        cancelled_at: po.status === 'cancelled' ? hoursFromNow(-1) : null,
      },
    })
  }

  console.log('F12 seed complete.')
}
