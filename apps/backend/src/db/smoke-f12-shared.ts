import assert from 'node:assert/strict'
import path from 'node:path'
import { JwtService } from '@nestjs/jwt'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'))
} catch {
  // Environment variables may be supplied by the shell.
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const jwt = new JwtService({ secret: process.env.ACCESS_TOKEN_SECRET, signOptions: { expiresIn: '10m' } })
const base = `http://localhost:${process.env.PORT ?? '8080'}`

async function request<T>(token: string, endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${base}/api/${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const payload = await response.text()
  assert(response.ok, `${method} ${endpoint}: ${response.status} ${payload}`)
  return (payload ? JSON.parse(payload) : undefined) as T
}

async function main() {
  const [customer, staff] = await Promise.all([
    db.customer.findFirstOrThrow({ where: { deleted_at: null }, include: { user: true } }),
    db.staff.findFirstOrThrow({ where: { deleted_at: null }, include: { user: true } }),
  ])
  const buyer = jwt.sign({ sub: customer.user_id, email: customer.user.email })
  const caterer = jwt.sign({ sub: staff.user_id, email: staff.user.email })
  const booking = await request<{ id: string; flights: [{ id: string; cabinClass: string; cutoffAt: string }] }>(
    buyer,
    'product-orders/booking/demo',
  )
  const [flight] = booking.flights
  const catalogPath = `catalog?flightId=${flight.id}&cabin=${flight.cabinClass}`
  const loadCatalog = () =>
    request<{ cutoffAt: string; products: Array<{ id: string; sku: string; priceAmount: number; availableQuantity: number }> }>(
      buyer,
      catalogPath,
    )
  const previewPath = `staff/flights/${flight.id}/catering-order`
  const loadPreview = () =>
    request<{ status: string; cutoffAt: string; lines: Array<{ productId: string; quantityRequired: number }> }>(caterer, previewPath)
  const water = (await loadCatalog()).products.find((product) => product.sku === 'BEV-WATER-001')
  assert(water && water.availableQuantity >= 2, 'Seeded sparkling water must be in stock.')
  const loadWater = async () => (await loadCatalog()).products.find((product) => product.id === water.id)
  const productPath = `staff/products/${water.id}`
  const updatedPrice = water.priceAmount + 1
  await request(caterer, productPath, 'PUT', { priceAmount: updatedPrice })
  try {
    assert.equal((await loadWater())?.priceAmount, updatedPrice, 'A staff price change appears in the customer catalog.')
  } finally {
    await request(caterer, productPath, 'PUT', { priceAmount: water.priceAmount })
  }
  const available = async () => (await loadWater())?.availableQuantity
  const confirmedQuantity = async () => (await loadPreview()).lines.find((line) => line.productId === water.id)?.quantityRequired ?? 0
  const preview = await loadPreview()
  assert.equal(preview.cutoffAt, flight.cutoffAt, 'Staff and customer booking share the demo cutoff.')
  assert.equal((await loadCatalog()).cutoffAt, flight.cutoffAt, 'The customer shop uses the same cutoff.')
  assert.equal(preview.status, 'open', 'The demo flight needs an open order window.')
  const offeringsPath = 'staff/product-offerings'
  const existingOfferings = await request<Array<{ id: string; flightId: string | null; productId: string; cabin: string }>>(
    caterer,
    offeringsPath,
  )
  if (!existingOfferings.some((row) => row.flightId === flight.id && row.productId === water.id && row.cabin === flight.cabinClass)) {
    const menu = (await loadCatalog()).products.map((product) => product.id).sort()
    const override = await request<{ id: string }>(caterer, offeringsPath, 'POST', {
      productId: water.id,
      scope: 'flight',
      flightId: flight.id,
      cabin: flight.cabinClass,
      isActive: false,
      isDefault: false,
    })
    try {
      const updated = (await loadCatalog()).products.map((product) => product.id).sort()
      assert.deepEqual(
        updated,
        menu.filter((id) => id !== water.id),
        'A flight override hides only the selected drink.',
      )
      await request(caterer, `${offeringsPath}/${override.id}`, 'PUT', { isActive: true })
      assert.deepEqual(
        (await loadCatalog()).products.map((product) => product.id).sort(),
        menu,
        'Enabling the drink restores it to the shop.',
      )
    } finally {
      await request(caterer, `${offeringsPath}/${override.id}`, 'DELETE')
    }
  }
  const initialConfirmed = await confirmedQuantity()

  const order = await request<{ id: string; status: string }>(buyer, 'product-orders', 'POST', {
    bookingId: booking.id,
    flightId: flight.id,
    cabin: flight.cabinClass,
    lines: [{ productId: water.id, quantity: 2, bookingPassengerId: null }],
  })
  assert.equal(order.status, 'pending_payment')
  const orderPath = `product-orders/${order.id}`
  try {
    assert.equal(await available(), water.availableQuantity - 2, 'Checkout reserves both units.')
    assert.equal(await confirmedQuantity(), initialConfirmed, 'Pending payment does not count in catering.')
    for (let attempt = 0; attempt < 2; attempt++) {
      const confirmed = await request<{ status: string }>(buyer, `${orderPath}/demo-payment`, 'POST', { status: 'paid' })
      assert.equal(confirmed.status, 'confirmed')
      assert.equal(await confirmedQuantity(), initialConfirmed + 2, 'The confirmed item appears once in the staff preview.')
    }
  } finally {
    const cancelled = await request<{ status: string }>(buyer, orderPath, 'DELETE')
    assert.equal(cancelled.status, 'cancelled')
  }
  assert.equal(await available(), water.availableQuantity, 'Cancellation restores the stock.')
  assert.equal(await confirmedQuantity(), initialConfirmed, 'Cancellation removes the item from the staff preview.')
  console.log(
    'F12 shared flow passed: staff catalog edit, checkout, stock reservation, payment, staff preview, cancellation, and stock release.',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
