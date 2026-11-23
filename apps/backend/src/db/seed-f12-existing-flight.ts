import { randomInt, randomUUID } from 'node:crypto'
import type { PrismaClient } from './generated/prisma/client'
import { SystemClock } from '../modules/onboard-products/common/clock'

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CABINS = ['economy', 'business', 'premium_economy'] as const
const stockSku = 'BEV-WATER-001'

export async function seedDemoWarehouses(prisma: PrismaClient) {
  const [activeAirports, activeWarehouses] = await Promise.all([
    prisma.airport.findMany({ where: { is_active: true }, select: { iata_code: true } }),
    prisma.warehouse.findMany({ where: { deleted_at: null }, select: { airport_code: true } }),
  ])
  const airportsWithWarehouse = new Set(activeWarehouses.map((row) => row.airport_code))
  for (const { iata_code: code } of activeAirports) {
    if (airportsWithWarehouse.has(code)) continue
    await prisma.warehouse.upsert({
      where: { code: `WH-${code}` },
      update: { deleted_at: null },
      create: { airport_code: code, code: `WH-${code}`, name: `${code} Catering Warehouse` },
    })
  }
}

export async function seedF12ExistingFlight(prisma: PrismaClient, customerId: string, email: string, flightNumber: string) {
  const now = new SystemClock().now()
  const flight = await prisma.flight.findFirst({
    where: { flight_number: { equals: flightNumber.trim(), mode: 'insensitive' }, status: 'scheduled', scheduled_dep_at: { gt: now } },
    orderBy: { scheduled_dep_at: 'asc' },
    include: { route: true, seat_inventory: true },
  })
  if (!flight) throw new Error(`No upcoming scheduled flight matches "${flightNumber}". Copy its number from F2.`)

  const idempotencyKey = `f12-existing-flight:${flight.id}`
  const existingBooking = await prisma.booking.findFirst({
    where: { customer_id: customerId, idempotency_key: idempotencyKey },
    include: { booking_segment: true },
  })
  const existingCabin = existingBooking?.booking_segment[0]?.cabin
  const settings = await prisma.cabin_setting.findMany({
    where: { OR: [{ scope: 'network' }, { route_id: flight.route_id }, { flight_id: flight.id }] },
  })
  const cabin = CABINS.find((value) => {
    const matching = ['flight', 'route', 'network'].map((scope) => settings.find((row) => row.scope === scope && row.cabin === value))
    const preorder = matching.find((row) => row?.preorder_enabled != null)?.preorder_enabled
    const snacks = matching.find((row) => row?.snacks_enabled != null)?.snacks_enabled
    const hours = matching.find((row) => row?.order_window_hours != null)?.order_window_hours ?? 48
    const seats = flight.seat_inventory.find((row) => row.cabin === value)
    return (
      preorder &&
      snacks &&
      flight.scheduled_dep_at.getTime() - hours * 3_600_000 > now.getTime() &&
      (value === existingCabin || !seats || seats.sold_count + seats.held_count < seats.capacity)
    )
  })
  if (!cabin)
    throw new Error('The flight needs an available cabin with pre-orders and snacks enabled and an order window that is still open.')

  const [customer, product, staff, supplier, pricing] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    prisma.product.findFirstOrThrow({ where: { sku: stockSku, is_active: true, deleted_at: null } }),
    prisma.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { id: true } }),
    prisma.supplier.findFirstOrThrow({ where: { is_active: true, deleted_at: null }, select: { id: true } }),
    prisma.pricing_setting.findUnique({ where: { key: 'base_currency' } }),
  ])
  await seedDemoWarehouses(prisma)
  const airportCode = flight.route.origin
  const booking = await prisma.$transaction(async (tx) => {
    // Serialize runs for this flight so the fixture does not double-count a seat.
    await tx.$queryRaw`SELECT id FROM flight WHERE id = ${flight.id}::uuid FOR UPDATE`
    const existing = await tx.booking.findFirst({ where: { customer_id: customerId, idempotency_key: idempotencyKey } })
    if (existing && existing.status !== 'confirmed')
      throw new Error('This flight already has a cancelled demo booking for the selected customer.')
    const existingSegment = existing
      ? await tx.booking_segment.findFirstOrThrow({ where: { booking_id: existing.id, flight_id: flight.id } })
      : null
    const selectedCabin = existingSegment?.cabin ?? cabin
    const warehouse =
      (await tx.warehouse.findFirst({ where: { airport_code: airportCode, deleted_at: null } })) ??
      (await tx.warehouse.upsert({
        where: { code: `WH-${airportCode}` },
        update: { deleted_at: null },
        create: { airport_code: airportCode, code: `WH-${airportCode}`, name: `${airportCode} Catering Warehouse` },
      }))

    const stock = await tx.warehouse_stock.findUnique({
      where: { warehouse_id_product_id: { warehouse_id: warehouse.id, product_id: product.id } },
    })
    const usable = await tx.stock_batch.aggregate({
      where: {
        warehouse_id: warehouse.id,
        product_id: product.id,
        is_damaged: false,
        OR: [{ expires_at: null }, { expires_at: { gt: flight.scheduled_dep_at } }],
      },
      _sum: { quantity_remaining: true },
    })
    if (!stock || Math.min(stock.quantity_on_hand, usable._sum.quantity_remaining ?? 0) <= stock.quantity_reserved) {
      const receipt = await tx.purchase_receipt.create({
        data: { supplier_id: supplier.id, warehouse_id: warehouse.id, received_by_staff_id: staff.id, received_at: now },
      })
      const quantity = 24
      const batch = await tx.stock_batch.create({
        data: {
          purchase_receipt_id: receipt.id,
          warehouse_id: warehouse.id,
          product_id: product.id,
          batch_code: `F12-DEMO-${randomUUID().slice(0, 8)}`,
          quantity_received: quantity,
          quantity_remaining: quantity,
          unit_cost_amount: product.purchase_cost_amount ?? product.price_amount,
          received_at: now,
          expires_at: new Date(flight.scheduled_dep_at.getTime() + 86_400_000),
        },
      })
      await tx.warehouse_stock.upsert({
        where: { warehouse_id_product_id: { warehouse_id: warehouse.id, product_id: product.id } },
        update: { quantity_on_hand: { increment: quantity } },
        create: { warehouse_id: warehouse.id, product_id: product.id, quantity_on_hand: quantity },
      })
      await tx.stock_movement.create({
        data: {
          product_id: product.id,
          warehouse_id: warehouse.id,
          stock_batch_id: batch.id,
          type: 'receive',
          quantity,
          created_by_staff_id: staff.id,
          occurred_at: now,
        },
      })
    }

    const menuCabin = selectedCabin === 'premium_economy' ? 'economy' : selectedCabin
    const offering = await tx.product_offering.findFirst({
      where: { product_id: product.id, flight_id: flight.id, cabin: menuCabin, deleted_at: null },
    })
    if (offering) {
      if (!offering.is_active) await tx.product_offering.update({ where: { id: offering.id }, data: { is_active: true } })
    } else {
      await tx.product_offering.create({
        data: { product_id: product.id, flight_id: flight.id, cabin: menuCabin, scope: 'flight', is_active: true },
      })
    }
    if (existing) return existing

    await tx.seat_inventory.upsert({
      where: { flight_id_cabin: { flight_id: flight.id, cabin: selectedCabin } },
      update: {},
      create: { flight_id: flight.id, cabin: selectedCabin, capacity: 1 },
    })
    const sold = await tx.$executeRaw`
      UPDATE seat_inventory SET sold_count = sold_count + 1, updated_at = now()
      WHERE flight_id = ${flight.id}::uuid AND cabin = ${selectedCabin} AND sold_count + held_count < capacity
    `
    if (!sold) throw new Error('No seat is available in the selected demo cabin.')
    const reference = Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('')
    const created = await tx.booking.create({
      data: {
        booking_reference: reference,
        customer_id: customerId,
        trip_type: 'one_way',
        status: 'confirmed',
        currency: pricing?.value ?? 'USD',
        contact_email: email,
        idempotency_key: idempotencyKey,
        booked_at: now,
        confirmed_at: now,
        hold_expires_at: new Date(now.getTime() + 3_600_000),
      },
    })
    const [segment, passenger] = await Promise.all([
      tx.booking_segment.create({ data: { booking_id: created.id, flight_id: flight.id, segment_order: 1, cabin: selectedCabin } }),
      tx.booking_passenger.create({ data: { booking_id: created.id, passenger_id: customer.passenger_id, passenger_type: 'adult' } }),
    ])
    await tx.booking_coupon.create({
      data: {
        booking_id: created.id,
        booking_segment_id: segment.id,
        booking_passenger_id: passenger.id,
        flight_id: flight.id,
        passenger_id: customer.passenger_id,
        price_total: 0,
        ticket_number: `217${String(randomInt(10_000_000_000)).padStart(10, '0')}`,
        status: 'confirmed',
      },
    })
    return created
  })
  console.log(
    `Booking ${booking.booking_reference} is confirmed on ${flight.flight_number} (${airportCode} to ${flight.route.destination}).`,
  )
  console.log(`Open http://localhost:5151/bookings/${booking.booking_reference}/shop for snacks and drinks.`)
}
