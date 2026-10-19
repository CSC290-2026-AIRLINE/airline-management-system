// E2E smoke test. Mints a JWT for the first staff user, then walks
// the F12 surface: products, warehouses, suppliers, batches, stock
// movements, offerings, cabin settings, catering orders, stock
// transfers, aircraft stock, sales, flight report.

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
  results.push({ name, ok: res.ok, status: res.status, preview: text.slice(0, 200) })
}

let TOKEN = ''

async function main() {
  // Find the first staff + their user
  const staff = await prisma.staff.findFirst({ where: { deleted_at: null }, include: { user: true } })
  if (!staff) throw new Error('No staff row found; run db:seed first.')
  TOKEN = jwt.sign({ sub: staff.user_id, email: staff.user.email })
  console.log(`Using staff ${staff.id} (user ${staff.user_id})\n`)

  // --- Products (list, get, create, update, delete) ---
  await call('products.list', '/api/staff/products')
  const productsList = await fetch(`${BASE}/api/staff/products`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json())
  const firstProduct = productsList[0]
  if (firstProduct) await call('products.get', `/api/staff/products/${firstProduct.id}`)
  await call('products.create', '/api/staff/products', {
    method: 'PUT',
    body: JSON.stringify({
      sku: 'TEST-001',
      category: 'snack',
      typeCode: 'STD',
      name: 'Test snack',
      price_amount: '5.00',
      purchase_cost_amount: '1.00',
      shelf_life_days: 30,
    }),
  })

  // --- Warehouses ---
  await call('warehouses.list', '/api/staff/warehouses')

  // --- Suppliers ---
  await call('suppliers.list', '/api/staff/suppliers')

  // --- Stock batches ---
  await call('stock-batches.list', '/api/staff/stock-batches')

  // --- Stock movements ---
  await call('stock-movements.list', '/api/staff/stock-movements')

  // --- Offerings ---
  await call('offerings.list', '/api/staff/product-offerings')

  // --- Cabin settings ---
  await call('cabin-settings.network', '/api/staff/cabin-settings/network')
  await call(
    'cabin-settings.resolve-network-economy',
    '/api/staff/cabin-settings/resolve/00000000-0000-0000-0000-d00000000001?cabin=economy',
  )

  // --- Catering orders ---
  await call('catering-orders.list', '/api/staff/catering-orders')
  await call('catering-orders.get-f401', '/api/staff/catering-orders/flight/00000000-0000-0000-0000-f00000000001')
  // 405 has a loaded order; that's idempotent for refresh
  await call('catering-orders.refresh-f405', '/api/staff/catering-orders/flight/00000000-0000-0000-0000-f00000000002/refresh', {
    method: 'PUT',
    body: '{}',
  })

  // --- Stock transfers ---
  await call('stock-transfers.list-f401', '/api/staff/stock-transfers/flight/00000000-0000-0000-0000-f00000000001')

  // --- Aircraft stock ---
  await call('aircraft-stock.list-fyb', '/api/staff/aircraft-stock/00000000-0000-0000-0000-c00000000002')

  // --- Sales ---
  await call('sales.list-f401', '/api/staff/sales/flight/00000000-0000-0000-0000-f00000000001')

  // --- Flight report ---
  await call('flight-report.list-reportable', '/api/staff/flight-reports/reportable-flights')
  await call('flight-report.get-f401', '/api/staff/flight-reports/flight/00000000-0000-0000-0000-f00000000001')

  // --- Report ---
  console.log('\n=== Results ===')
  for (const r of results) {
    const flag = r.ok ? 'OK' : 'FAIL'
    console.log(`[${flag}] ${r.status} ${r.name}  ${r.preview.slice(0, 80)}`)
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
