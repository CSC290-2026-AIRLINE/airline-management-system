// F12 test booking (idempotent). Gives one customer a confirmed return booking they can open on the customer web app and
// buy meals, snacks and duty-free for:
//
//   npm run db:seed:f12-booking -w apps/backend -- you@example.com
//
// The email is the one you sign in with. Sign in once first, so the customer row exists. Run `npm run db:seed` once
// first (it creates the airports, aircraft, products, stock and menus); this script then adds the booking. Both flights leave in more than 48 hours, so the
// default order window is still open. Booking reference: FTEST2.

import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'))
} catch {
  // .env is optional (DATABASE_URL may come from the shell)
}

// The same stable ids the F12 section of seed.ts uses.
const id = (s: string): string => `00000000-0000-0000-0000-${s.padStart(12, '0')}`

const TEST = {
  booking: id('e12000000001'),
  outbound: id('e12000000002'),
  inbound: id('e12000000003'),
  segOut: id('e12000000004'),
  segBack: id('e12000000005'),
  holder: id('e12000000006'),
  companion: id('e12000000007'),
  companionPassenger: id('e12000000008'),
  couponOutHolder: id('e12000000010'),
  couponOutCompanion: id('e12000000011'),
  couponBackHolder: id('e12000000012'),
  couponBackCompanion: id('e12000000013'),
  orderConfirmed: id('e12000000020'),
  orderCancelled: id('e12000000021'),
  paymentConfirmed: id('e12000000030'),
}

const hoursFromNow = (h: number): Date => new Date(Date.now() + h * 3_600_000)
const addMinutes = (d: Date, m: number): Date => new Date(d.getTime() + m * 60_000)

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email) {
    throw new Error('Usage: npm run db:seed:f12-booking -w apps/backend -- <the email you sign in with>')
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  try {
    const user = await prisma.user.findFirst({ where: { email, customer: { some: {} } }, include: { customer: true } })
    const customer = user?.customer[0]
    if (!customer) {
      throw new Error(`No customer with email ${email}. Sign in to the customer web app once, then run this again.`)
    }

    // The F12 demo data (airports, aircraft, products, stock and menus) comes from `npm run db:seed`. Look its rows up by
    // name rather than by id.
    const aircraft = await prisma.aircraft.findFirst({ where: { tail_number: 'HS-FYA' } })
    if (!aircraft) throw new Error('The F12 demo data is missing. Run `npm run db:seed -w apps/backend` first, then run this again.')
    const bkkNrt = await prisma.route.findFirstOrThrow({ where: { origin: 'BKK', destination: 'NRT' } })
    const nrtBkk = await prisma.route.findFirstOrThrow({ where: { origin: 'NRT', destination: 'BKK' } })

    // Two flights, more than 48 hours out. 96h and 120h keep clear of the other seeded flights on the same aircraft.
    const flights = [
      { id: TEST.outbound, number: 'FL501', route: bkkNrt.id, dep: hoursFromNow(96), minutes: 390, cabin: 'economy' },
      { id: TEST.inbound, number: 'FL502', route: nrtBkk.id, dep: hoursFromNow(120), minutes: 390, cabin: 'business' },
    ]
    for (const f of flights) {
      const data = {
        flight_number: f.number,
        service_date: new Date(f.dep.toISOString().slice(0, 10)),
        route_id: f.route,
        scheduled_dep_at: f.dep,
        scheduled_arr_at: addMinutes(f.dep, f.minutes),
        dep_at: f.dep,
        arr_at: addMinutes(f.dep, f.minutes),
        aircraft_id: aircraft.id,
        status: 'scheduled',
      }
      await prisma.flight.upsert({ where: { id: f.id }, update: data, create: { id: f.id, ...data } })
      await prisma.seat_inventory.upsert({
        where: { flight_id_cabin: { flight_id: f.id, cabin: f.cabin } },
        update: {},
        create: { flight_id: f.id, cabin: f.cabin, capacity: 150, sold_count: 2 },
      })
    }

    const now = new Date()
    // The booking moves to the customer you gave: clear the test rows of an earlier run for someone else first.
    const earlierHolder = await prisma.booking_passenger.findUnique({ where: { id: TEST.holder } })
    if (earlierHolder && earlierHolder.passenger_id !== customer.passenger_id) {
      const orderIds = [TEST.orderConfirmed, TEST.orderCancelled]
      await prisma.product_order_line.deleteMany({ where: { product_order_id: { in: orderIds } } })
      await prisma.product_order.deleteMany({ where: { id: { in: orderIds } } })
      await prisma.payment.deleteMany({ where: { id: TEST.paymentConfirmed } })
      await prisma.booking_coupon.deleteMany({ where: { booking_id: TEST.booking } })
      await prisma.booking_passenger.deleteMany({ where: { booking_id: TEST.booking } })
    }
    await prisma.booking.upsert({
      where: { id: TEST.booking },
      update: { customer_id: customer.id, status: 'confirmed' },
      create: {
        id: TEST.booking,
        booking_reference: 'FTEST2',
        customer_id: customer.id,
        trip_type: 'return',
        status: 'confirmed',
        payment_type: 'cash',
        currency: 'USD',
        contact_email: email,
        idempotency_key: 'f12-test-booking',
        booked_at: now,
        hold_expires_at: hoursFromNow(1),
        confirmed_at: now,
      },
    })

    // The account holder, and a second passenger so the meal picker has two people.
    await prisma.passenger.upsert({
      where: { id: TEST.companionPassenger },
      update: {},
      create: { id: TEST.companionPassenger, first_name: 'Test', last_name: 'Companion', gender: 'X', nationality: 'th' },
    })
    await prisma.booking_passenger.upsert({
      where: { id: TEST.holder },
      update: { passenger_id: customer.passenger_id },
      create: { id: TEST.holder, booking_id: TEST.booking, passenger_id: customer.passenger_id, passenger_type: 'adult' },
    })
    await prisma.booking_passenger.upsert({
      where: { id: TEST.companion },
      update: {},
      create: { id: TEST.companion, booking_id: TEST.booking, passenger_id: TEST.companionPassenger, passenger_type: 'adult' },
    })

    await prisma.booking_segment.upsert({
      where: { id: TEST.segOut },
      update: {},
      create: { id: TEST.segOut, booking_id: TEST.booking, flight_id: TEST.outbound, segment_order: 1, cabin: 'economy' },
    })
    await prisma.booking_segment.upsert({
      where: { id: TEST.segBack },
      update: {},
      create: { id: TEST.segBack, booking_id: TEST.booking, flight_id: TEST.inbound, segment_order: 2, cabin: 'business' },
    })

    // A meal line needs the passenger's ticket (coupon) on that flight.
    const coupons = [
      {
        id: TEST.couponOutHolder,
        segment: TEST.segOut,
        flight: TEST.outbound,
        bp: TEST.holder,
        passenger: customer.passenger_id,
        ticket: '2170000000011',
      },
      {
        id: TEST.couponOutCompanion,
        segment: TEST.segOut,
        flight: TEST.outbound,
        bp: TEST.companion,
        passenger: TEST.companionPassenger,
        ticket: '2170000000028',
      },
      {
        id: TEST.couponBackHolder,
        segment: TEST.segBack,
        flight: TEST.inbound,
        bp: TEST.holder,
        passenger: customer.passenger_id,
        ticket: '2170000000035',
      },
      {
        id: TEST.couponBackCompanion,
        segment: TEST.segBack,
        flight: TEST.inbound,
        bp: TEST.companion,
        passenger: TEST.companionPassenger,
        ticket: '2170000000042',
      },
    ]
    for (const c of coupons) {
      await prisma.booking_coupon.upsert({
        where: { id: c.id },
        update: { passenger_id: c.passenger },
        create: {
          id: c.id,
          booking_id: TEST.booking,
          booking_segment_id: c.segment,
          booking_passenger_id: c.bp,
          flight_id: c.flight,
          passenger_id: c.passenger,
          price_total: 250,
          ticket_number: c.ticket,
          status: 'confirmed',
        },
      })
    }

    // Two sample orders on FL501: one paid (a meal and a snack), one cancelled. A third can be placed in the shop.
    const meal = await prisma.product.findFirstOrThrow({ where: { sku: 'MEAL-BEEF-001' } })
    const snack = await prisma.product.findFirstOrThrow({ where: { sku: 'SNK-NUTS-001' } })
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { airport_code: 'BKK', deleted_at: null } })
    const mealPrice = Number(meal.price_amount)
    const snackPrice = Number(snack.price_amount)
    const paidTotal = mealPrice + snackPrice
    // F12 records orders in F4's base currency, the same as checkout (CateringSettingsService.baseCurrency).
    const currency = (await prisma.pricing_setting.findUnique({ where: { key: 'base_currency' } }))?.value?.trim().toUpperCase() || 'USD'
    const orderBase = { customer_id: customer.id, booking_id: TEST.booking, flight_id: TEST.outbound, cabin: 'economy', currency }

    if (!(await prisma.product_order.findUnique({ where: { id: TEST.orderConfirmed } }))) {
      await prisma.payment.upsert({
        where: { id: TEST.paymentConfirmed },
        update: {},
        create: {
          id: TEST.paymentConfirmed,
          source_feature: 12,
          purchase_ref: TEST.orderConfirmed,
          payer_customer_id: customer.id,
          idempotency_key: `f12:${TEST.orderConfirmed}`,
          status: 'captured',
          provider: 'fake',
          currency,
          amount_total: paidTotal,
          card_amount: paidTotal,
          started_at: now,
          expires_at: hoursFromNow(1),
          authorised_at: now,
          captured_at: now,
        },
      })
      await prisma.product_order.create({
        data: {
          ...orderBase,
          id: TEST.orderConfirmed,
          status: 'confirmed',
          total_amount: paidTotal,
          payment_id: TEST.paymentConfirmed,
          paid_at: now,
          expires_at: hoursFromNow(48),
          product_order_line: {
            create: [
              {
                product_id: meal.id,
                category: 'meal',
                booking_passenger_id: TEST.holder,
                quantity: 1,
                unit_price_amount: mealPrice,
                price_basis: 'standard',
              },
              { product_id: snack.id, category: 'snack', quantity: 1, unit_price_amount: snackPrice, price_basis: 'standard' },
            ],
          },
        },
      })
      // A confirmed order holds its stock, so cancelling it in the shop can release it.
      // The reserve movement is written too, the same way checkout does it, so the ledger matches.
      for (const productId of [meal.id, snack.id]) {
        await prisma.stock_movement.create({
          data: {
            product_id: productId,
            warehouse_id: warehouse.id,
            product_order_id: TEST.orderConfirmed,
            flight_id: TEST.outbound,
            type: 'reserve',
            quantity: -1,
            reason: null,
            note: 'reserved for customer order',
            created_by_staff_id: null,
            occurred_at: new Date(),
          },
        })
        await prisma.warehouse_stock.updateMany({
          where: { warehouse_id: warehouse.id, product_id: productId },
          data: { quantity_reserved: { increment: 1 } },
        })
      }
    }
    if (!(await prisma.product_order.findUnique({ where: { id: TEST.orderCancelled } }))) {
      await prisma.product_order.create({
        data: {
          ...orderBase,
          id: TEST.orderCancelled,
          status: 'cancelled',
          total_amount: snackPrice,
          expires_at: hoursFromNow(48),
          cancelled_at: now,
          product_order_line: {
            create: [
              {
                product_id: snack.id,
                category: 'snack',
                quantity: 1,
                unit_price_amount: snackPrice,
                price_basis: 'standard',
                deleted_at: now,
              },
            ],
          },
        },
      })
    }

    console.log(`Test booking FTEST2 ready for ${email}.`)
    console.log('Open /bookings/FTEST2. FL501 BKK→NRT is economy (paid meals), FL502 NRT→BKK is business (complimentary).')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
