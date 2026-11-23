// E2E smoke test for the F12 module. Mints a JWT for the first staff
// user and one for the first customer, then walks the full F12 surface
// in three parts:
//   1. The staff read endpoints (list, get, resolve, stock, ...)
//   2. The staff write endpoints that exercise the main flows:
//      - create product (with dietaryAttributes)
//      - receive delivery (purchase receipt)
//      - adjust stock (stock movement)
//      - upsert a cabin setting
//      - offer a product
//      - refresh a generated catering order
//      - transfer the stock to the aircraft and mark the order loaded
//      - submit a flight report
//   3. The customer API:
//      - the catalogue of a flight
//      - a checkout (reserve stock, start the payment)
//      - the order list and the order detail
//      - a payment event, and the same event a second time (F5 retries)
//      - a cancel
//
// The routes are the ones of the Iteration-02 API table: creates are
// POST, edits are PUT, and there is no PATCH.

import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'
import { JwtService } from '@nestjs/jwt'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'))
} catch {
  /* .env is optional */
}

const BASE = 'http://localhost:8080'
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const jwt = new JwtService({ secret: process.env.ACCESS_TOKEN_SECRET, signOptions: { expiresIn: '1h' } })

// Stable IDs from the F12 seed.
const IDS = {
  warehouseBKK: '00000000-0000-0000-0000-200000000001',
  supplierBKK: '00000000-0000-0000-0000-300000000001',
  productBeef: '00000000-0000-0000-0000-100000000001',
  productWater: '00000000-0000-0000-0000-100000000007',
  flightF401: '00000000-0000-0000-0000-f00000000001',
  flightF405: '00000000-0000-0000-0000-f00000000002',
  flightF308: '00000000-0000-0000-0000-f00000000003',
  flightF309: '00000000-0000-0000-0000-f00000000005',
  aircraftFYA: '00000000-0000-0000-0000-c00000000001',
  aircraftFYB: '00000000-0000-0000-0000-c00000000002',
  routeBkkNrt: '00000000-0000-0000-0000-d00000000001',
}

interface Result {
  name: string
  ok: boolean
  status: number
  preview: string
}
const results: Result[] = []

async function call(name: string, path: string, init?: RequestInit, token = TOKEN): Promise<string> {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  results.push({ name, ok: res.ok, status: res.status, preview: text.slice(0, 2000) })
  return text
}

// Same as call() but treats REPORT_ALREADY_SUBMITTED (409) as a
// pass: that just means the seed was already exercised in a previous
// run, and the row is in its final state. Anything else still fails
// loudly.
async function callIdempotent(name: string, path: string, init?: RequestInit): Promise<string> {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}), Authorization: `Bearer ${TOKEN}` },
  })
  const text = await res.text()
  if (res.status === 409 && text.includes('REPORT_ALREADY_SUBMITTED')) {
    results.push({ name, ok: true, status: res.status, preview: 'REPORT_ALREADY_SUBMITTED (idempotent re-run OK)' })
    return text
  }
  results.push({ name, ok: res.ok, status: res.status, preview: text.slice(0, 2000) })
  return text
}

let TOKEN = ''
let CUSTOMER_TOKEN = ''

async function main() {
  // Find the first staff + their user.
  const staff = await prisma.staff.findFirst({ where: { deleted_at: null }, include: { user: true } })
  if (!staff) throw new Error('No staff row found; run db:seed first.')
  TOKEN = jwt.sign({ sub: staff.user_id, email: staff.user.email })
  console.log(`Using staff ${staff.id} (user ${staff.user_id})\n`)

  // The customer API needs a customer row, because an order is always
  // attached to one.
  const customer = await prisma.customer.findFirst({ where: { deleted_at: null }, include: { user: true } })
  if (!customer) throw new Error('No customer row found; run db:seed first.')
  CUSTOMER_TOKEN = jwt.sign({ sub: customer.user_id, email: customer.user.email })
  console.log(`Using customer ${customer.id} (user ${customer.user_id})\n`)

  // ============================================================
  // READ endpoints
  // ============================================================
  console.log('--- Read ---')
  await call('products.list', '/api/staff/products')
  await call('products.get-p001', `/api/staff/products/${IDS.productBeef}`)
  await call('warehouses.list', '/api/staff/warehouses')
  await call('suppliers.list', '/api/staff/suppliers')
  await call('stock-batches.list', '/api/staff/stock-batches')
  await call('stock-movements.list', '/api/staff/stock-movements')
  await call('offerings.list', '/api/staff/product-offerings')
  await call('offerings.list-bkk-nrt-economy', `/api/staff/product-offerings?routeId=${IDS.routeBkkNrt}&cabin=economy`)
  await call('cabin-settings.network', '/api/staff/cabin-settings?scope=network')
  await call('cabin-settings.route', `/api/staff/cabin-settings?scope=route&scopeId=${IDS.routeBkkNrt}`)
  await call('cabin-settings.flight', `/api/staff/cabin-settings?scope=flight&scopeId=${IDS.flightF401}&cabin=business`)
  await call('cabin-settings.resolved-f401', `/api/staff/flights/${IDS.flightF401}/cabin-settings`)
  await call('catering-orders.list', '/api/staff/catering-orders')
  await call('catering-orders.list-range', '/api/staff/catering-orders?from=2020-01-01&to=2100-01-01')
  await call('catering-orders.get-f401', `/api/staff/flights/${IDS.flightF401}/catering-order`)
  await call('catering-orders.get-f309', `/api/staff/flights/${IDS.flightF309}/catering-order`)
  await call('aircraft-stock.list-fyb', `/api/staff/aircraft/${IDS.aircraftFYB}/stock`)
  await call('aircraft-stock.list-fya', `/api/staff/aircraft/${IDS.aircraftFYA}/stock`)
  await call('sales.list-f401', `/api/staff/flights/${IDS.flightF401}/sales`)
  await call('flight-report.get-f401', `/api/staff/flights/${IDS.flightF401}/flight-report`)
  await call('warehouse-stock.list', `/api/staff/warehouse-stock?warehouseId=${IDS.warehouseBKK}`)
  await call('warehouse-stock.list-low', `/api/staff/warehouse-stock?warehouseId=${IDS.warehouseBKK}&lowOnly=true`)
  // routes.list + routes.flights: the /api/staff/routes/:routeId/flights
  // endpoint that backs the route-detail page's "Single-flight picker".
  await call('routes.list', '/api/staff/routes')
  await call('routes.flights-bkk-nrt', `/api/staff/routes/${IDS.routeBkkNrt}/flights`)

  // ============================================================
  // WRITE endpoints
  // ============================================================
  console.log('\n--- Write ---')

  // products.create: needs the full draft shape including dietaryAttributes.
  await call('products.create', '/api/staff/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Smoke test snack',
      sku: `SMOKE-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      category: 'snack',
      typeCode: 'STD',
      dietaryAttributes: [],
      priceAmount: 5.0,
      purchaseCostAmount: 1.0,
      shelfLifeDays: 30,
      isPremium: false,
      isActive: true,
    }),
  })

  // purchase-receipts.create: receive a small delivery of sparkling water
  // at BKK from the BKK supplier. Uses an expiring batch 5 days out.
  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
  await call('purchase-receipts.create', '/api/staff/purchase-receipts', {
    method: 'POST',
    body: JSON.stringify({
      supplierId: IDS.supplierBKK,
      warehouseId: IDS.warehouseBKK,
      lines: [
        {
          productId: IDS.productWater,
          quantity: 10,
          unitCostAmount: 0.6,
          batchCode: `B-SMOKE-${Date.now().toString(36).toUpperCase()}`,
          expiresAt,
        },
      ],
    }),
  })

  // purchase-receipts.list with the date filter.
  await call('purchase-receipts.list', '/api/staff/purchase-receipts?warehouseId=' + IDS.warehouseBKK + '&from=2020-01-01')

  // stock-movements.create: remove 1 unit of beef stir-fry (spoilage).
  // Quantity is small so re-runs that already moved 1 unit will see
  // ADJUST_INSUFFICIENT and we accept that as a non-fatal in the
  // report (the call still ran).
  await call('stock-movements.create', '/api/staff/stock-movements', {
    method: 'POST',
    body: JSON.stringify({
      warehouseId: IDS.warehouseBKK,
      productId: IDS.productBeef,
      quantity: 1,
      reason: 'spoilage',
      note: 'smoke test',
    }),
  })

  // cabin-settings.upsert: network + economy, no-op patch is fine.
  await call('cabin-settings.upsert-network-economy', '/api/staff/cabin-settings', {
    method: 'PUT',
    body: JSON.stringify({
      scope: 'network',
      routeId: null,
      flightId: null,
      cabin: 'economy',
      orderWindowHours: 48,
    }),
  })

  // product-offerings.create: add sparkling water to network economy.
  await call('offerings.create-water-network-economy', '/api/staff/product-offerings', {
    method: 'POST',
    body: JSON.stringify({
      productId: IDS.productWater,
      scope: 'network',
      routeId: null,
      flightId: null,
      cabin: 'economy',
      isDefault: false,
      isActive: true,
    }),
  })

  // catering-orders.refresh: use the generated CO309 (FL309) so the
  // call is legal regardless of the seed state. Refresh is idempotent
  // (regenerates the lines), so re-running the smoke is safe.
  await call('catering-orders.refresh-f309', `/api/staff/flights/${IDS.flightF309}/catering-order`, {
    method: 'POST',
    body: '{}',
  })

  // stock-transfers: the catering order's lines move to the aircraft.
  // It is safe to retry, so a second call moves nothing.
  await call('stock-transfers.create-f309', `/api/staff/flights/${IDS.flightF309}/stock-transfers`, {
    method: 'POST',
    body: '{}',
  })
  await call('stock-transfers.create-f309-retry', `/api/staff/flights/${IDS.flightF309}/stock-transfers`, {
    method: 'POST',
    body: '{}',
  })

  // catering-orders.loaded: idempotent for f-401 (already loaded). The
  // endpoint returns the existing loaded order on a second call.
  await call('catering-orders.loaded-f401', `/api/staff/flights/${IDS.flightF401}/catering-order/loaded`, {
    method: 'PUT',
    body: '{}',
  })

  // flight-report.submit: use f-308 so the smoke is idempotent
  // (f-405 may have a report from a previous run). f-308 has 20 P007
  // (water) + 50 P011 (chocolate) on FYB. Submit only the water
  // line so the remaining aircraft stock on the chocolate batch is
  // left untouched. served=20, sold=0, wasted=0, damaged=0 →
  // remaining=0, valid. Re-runs of the smoke see REPORT_ALREADY_SUBMITTED
  // which is fine.
  await callIdempotent('flight-report.submit-f308', `/api/staff/flights/${IDS.flightF308}/flight-report`, {
    method: 'PUT',
    body: JSON.stringify({
      lines: [{ productId: IDS.productWater, served: 20, wasted: 0, damaged: 0 }],
    }),
  })

  // ============================================================
  // Customer API
  // ============================================================
  console.log('\n--- Customer ---')

  // The order window of a flight is the departure minus the cabin's
  // window (48h in the seed), so the smoke opens a short window on
  // F308's economy cabin to be able to check out.
  await call('cabin-settings.upsert-flight-f308-economy', '/api/staff/cabin-settings', {
    method: 'PUT',
    body: JSON.stringify({
      scope: 'flight',
      routeId: null,
      flightId: IDS.flightF308,
      cabin: 'economy',
      orderWindowHours: 2,
    }),
  })

  await call('catalog.f308-economy', `/api/catalog?flightId=${IDS.flightF308}&cabin=economy`, undefined, CUSTOMER_TOKEN)

  // The booking is a F3b stub: any UUID is a confirmed booking.
  const bookingId = '00000000-0000-4000-8000-00000000f012'
  const orderText = await call(
    'product-orders.checkout',
    '/api/product-orders',
    {
      method: 'POST',
      body: JSON.stringify({
        bookingId,
        flightId: IDS.flightF308,
        cabin: 'economy',
        lines: [{ productId: IDS.productWater, quantity: 2 }],
      }),
    },
    CUSTOMER_TOKEN,
  )

  await call('product-orders.list', `/api/product-orders?bookingId=${bookingId}`, undefined, CUSTOMER_TOKEN)

  let orderId = ''
  try {
    const parsed = JSON.parse(orderText) as { id?: string }
    orderId = parsed.id ?? ''
  } catch {
    orderId = ''
  }

  if (orderId) {
    await call('product-orders.get', `/api/product-orders/${orderId}`, undefined, CUSTOMER_TOKEN)

    // F5 reports the payment, and then the same event again: the
    // second one must not move the order a second time.
    await call('payment-events.paid', '/api/payment-events', {
      method: 'POST',
      body: JSON.stringify({ reference: orderId, status: 'paid' }),
    })
    await call('payment-events.paid-again', '/api/payment-events', {
      method: 'POST',
      body: JSON.stringify({ reference: orderId, status: 'paid' }),
    })

    // Cancel the order: it releases the stock and asks F5 to refund.
    await call('product-orders.cancel', `/api/product-orders/${orderId}`, { method: 'DELETE' }, CUSTOMER_TOKEN)
  } else {
    console.log('No order id in the checkout response; the customer order steps are skipped.')
  }

  // ============================================================
  // Report
  // ============================================================
  console.log('\n=== Results ===')
  for (const r of results) {
    const flag = r.ok ? 'OK' : 'FAIL'
    console.log(`[${flag}] ${r.status} ${r.name}  ${r.preview}`)
  }
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
