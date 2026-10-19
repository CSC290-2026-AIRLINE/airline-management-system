// E2E smoke test for the F12 module. Mints a JWT for the first staff
// user, then walks the full F12 surface in two halves:
//   1. Read endpoints (list, get, resolve, reportable flights, etc.)
//   2. Write endpoints that exercise the main flows:
//      - create product (with dietaryAttributes)
//      - receive delivery (purchase receipt)
//      - adjust stock (stock movement)
//      - upsert network cabin setting
//      - upsert a product offering
//      - refresh a generated catering order
//      - load a catering order (idempotent for the loaded ones)
//      - submit a flight report

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
}

interface Result {
  name: string
  ok: boolean
  status: number
  preview: string
}
const results: Result[] = []

async function call(name: string, path: string, init?: RequestInit): Promise<void> {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}), Authorization: `Bearer ${TOKEN}` },
  })
  const text = await res.text()
  results.push({ name, ok: res.ok, status: res.status, preview: text.slice(0, 2000) })
}

// Same as call() but treats REPORT_ALREADY_SUBMITTED (409) as a
// pass: that just means the seed was already exercised in a previous
// run, and the row is in its final state. Anything else still fails
// loudly.
async function callIdempotent(name: string, path: string, init?: RequestInit): Promise<void> {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}), Authorization: `Bearer ${TOKEN}` },
  })
  const text = await res.text()
  if (res.status === 409 && text.includes('REPORT_ALREADY_SUBMITTED')) {
    results.push({ name, ok: true, status: res.status, preview: 'REPORT_ALREADY_SUBMITTED (idempotent re-run OK)' })
    return
  }
  results.push({ name, ok: res.ok, status: res.status, preview: text.slice(0, 2000) })
}

let TOKEN = ''

async function main() {
  // Find the first staff + their user.
  const staff = await prisma.staff.findFirst({ where: { deleted_at: null }, include: { user: true } })
  if (!staff) throw new Error('No staff row found; run db:seed first.')
  TOKEN = jwt.sign({ sub: staff.user_id, email: staff.user.email })
  console.log(`Using staff ${staff.id} (user ${staff.user_id})\n`)

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
  await call('cabin-settings.network', '/api/staff/cabin-settings/network')
  // cabin-settings.resolve takes a flightId, not a routeId.
  await call('cabin-settings.resolve-f401', `/api/staff/cabin-settings/resolve/${IDS.flightF401}`)
  await call('catering-orders.list', '/api/staff/catering-orders')
  await call('catering-orders.get-f401', `/api/staff/catering-orders/flight/${IDS.flightF401}`)
  await call('catering-orders.get-f309', `/api/staff/catering-orders/flight/${IDS.flightF309}`)
  await call('stock-transfers.list-f401', `/api/staff/stock-transfers/flight/${IDS.flightF401}`)
  await call('aircraft-stock.list-fyb', '/api/staff/aircraft-stock/00000000-0000-0000-0000-c00000000002')
  await call('aircraft-stock.list-fya', '/api/staff/aircraft-stock/00000000-0000-0000-0000-c00000000001')
  await call('sales.list-f401', `/api/staff/sales/flight/${IDS.flightF401}`)
  await call('flight-report.list-reportable', '/api/staff/flight-reports/reportable-flights')
  await call('flight-report.get-f401', `/api/staff/flight-reports/flight/${IDS.flightF401}`)

  // ============================================================
  // WRITE endpoints
  // ============================================================
  console.log('\n--- Write ---')

  // products.create: needs the full draft shape including dietaryAttributes.
  await call('products.create', '/api/staff/products', {
    method: 'PUT',
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
    method: 'PUT',
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

  // stock-movements.create: remove 1 unit of beef stir-fry (spoilage).
  // Quantity is small so re-runs that already moved 1 unit will see
  // ADJUST_INSUFFICIENT and we accept that as a non-fatal in the
  // report (the call still ran).
  await call('stock-movements.create', '/api/staff/stock-movements', {
    method: 'PUT',
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

  // product-offerings.upsert: add sparkling water to network economy.
  await call('offerings.upsert-water-network-economy', '/api/staff/product-offerings', {
    method: 'PUT',
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
  await call('catering-orders.refresh-f309', `/api/staff/catering-orders/flight/${IDS.flightF309}/refresh`, {
    method: 'PUT',
    body: '{}',
  })

  // catering-orders.load: idempotent for f-401 (already loaded). The
  // /load endpoint returns the existing loaded order on a second call.
  await call('catering-orders.load-f401', `/api/staff/catering-orders/flight/${IDS.flightF401}/load`, {
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
  await callIdempotent('flight-report.submit-f308', `/api/staff/flight-reports/flight/${IDS.flightF308}/submit`, {
    method: 'PUT',
    body: JSON.stringify({
      lines: [{ productId: IDS.productWater, served: 20, wasted: 0, damaged: 0 }],
    }),
  })

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
