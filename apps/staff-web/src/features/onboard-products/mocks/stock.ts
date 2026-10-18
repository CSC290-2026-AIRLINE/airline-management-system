// Mock data for warehouse stock and the related tables in the F12 spec:
// warehouse, warehouse_stock, supplier, stock_batch, stock_movement, and
// purchase_receipt. The store is module-level mutable so the Stock page,
// Receive delivery, Catering Orders and Flight Report all read and change
// the same numbers.

import { addDays } from './clock'
import type {
  AdjustStockInput,
  AircraftStockRow,
  CreatePurchaseReceiptInput,
  Product,
  PurchaseReceipt,
  StockBatch,
  StockMovement,
  StockTransfer,
  StockTransferLine,
  Supplier,
  Warehouse,
  WarehouseStockRow,
} from '../api/types'
import { mockProducts } from './products'

// -- Static seed (warehouses, suppliers) -------------------------------------

export const mockWarehouses: Warehouse[] = [
  { id: 'w-bkk', code: 'BKK', name: 'Bangkok Warehouse', airportCode: 'BKK' },
  { id: 'w-nrt', code: 'NRT', name: 'Narita Warehouse', airportCode: 'NRT' },
  { id: 'w-hkg', code: 'HKG', name: 'Hong Kong Warehouse', airportCode: 'HKG' },
  { id: 'w-sin', code: 'SIN', name: 'Singapore Warehouse', airportCode: 'SIN' },
]

export const mockSuppliers: Supplier[] = [
  { id: 's-bkk-01', name: 'Bangkok Catering Co.', airportCode: 'BKK', contact: '+66 2 555 0100', isActive: true },
  { id: 's-bkk-02', name: 'Siam Fresh Foods', airportCode: 'BKK', contact: '+66 2 555 0144', isActive: true },
  { id: 's-nrt-01', name: 'Tokyo Foods Ltd.', airportCode: 'NRT', contact: '+81 3 555 0200', isActive: true },
  { id: 's-hkg-01', name: 'Hong Kong Supply Group', airportCode: 'HKG', contact: '+852 2 555 0300', isActive: true },
  { id: 's-sin-01', name: 'Singapore Catering Pte', airportCode: 'SIN', contact: '+65 6 555 0400', isActive: true },
  { id: 's-bkk-old', name: 'Old Bangkok Vendor', airportCode: 'BKK', contact: null, isActive: false },
]

// -- Mutable store -----------------------------------------------------------
// Catering Orders and Flight Report will both read and change these later.
// Using arrays + module-level references keeps it simple.

interface StockStore {
  stock: WarehouseStockRow[]
  batches: StockBatch[]
  movements: StockMovement[]
  receipts: PurchaseReceipt[]
  // Counter for human-readable batch codes per warehouse (B-001, B-002, ...).
  batchCounters: Record<string, number>
  // Per-aircraft stock. Keyed by (aircraftId, productId, batchId).
  aircraftStock: AircraftStockRow[]
  // The full transfer history; the lines are flat rows.
  stockTransfers: StockTransfer[]
}

function nowIso(): string {
  return '2026-10-08T09:00:00Z'
}

function productById(id: string): Product | undefined {
  return mockProducts.find((p) => p.id === id)
}

// Seed the warehouse_stock rows so the Stock page mirrors the prototype
// (BKK has 7 items stocked, three of them below reorder). The on-hand and
// reserved numbers here also need to match the sum of seeded batches.
function seedBkkStock(): { stock: WarehouseStockRow[]; batches: StockBatch[] } {
  const stock: WarehouseStockRow[] = []
  const batches: StockBatch[] = []
  let counter = 0
  const nextBatchCode = () => {
    counter += 1
    return `B-${String(counter).padStart(3, '0')}`
  }

  function addRow(opts: { productId: string; onHand: number; reserved: number; reorderLevel: number }): void {
    const product = productById(opts.productId)
    if (!product) return
    stock.push({
      id: `ws-${opts.productId}`,
      warehouseId: 'w-bkk',
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      quantityOnHand: opts.onHand,
      quantityReserved: opts.reserved,
      reorderLevel: opts.reorderLevel,
    })
  }

  // Green curry chicken -- 400 on hand in 4 batches, 96 reserved.
  addRow({ productId: 'p-001', onHand: 400, reserved: 96, reorderLevel: 150 })
  for (const q of [120, 120, 100, 60]) {
    batches.push({
      id: `b-bkk-${batches.length + 1}`,
      purchaseReceiptId: 'pr-seed',
      warehouseId: 'w-bkk',
      productId: 'p-001',
      batchCode: nextBatchCode(),
      quantityReceived: q,
      quantityRemaining: q,
      unitCostAmount: 4.5,
      receivedAt: nowIso(),
      expiresAt: addDays(2),
      isDamaged: false,
    })
  }

  // Braised beef -- 70 on hand (low), 64 reserved.
  addRow({ productId: 'p-002', onHand: 70, reserved: 64, reorderLevel: 100 })
  batches.push({
    id: `b-bkk-${batches.length + 1}`,
    purchaseReceiptId: 'pr-seed',
    warehouseId: 'w-bkk',
    productId: 'p-002',
    batchCode: nextBatchCode(),
    quantityReceived: 70,
    quantityRemaining: 70,
    unitCostAmount: 5.2,
    receivedAt: nowIso(),
    expiresAt: addDays(2),
    isDamaged: false,
  })

  // Vegetarian meal (VGML) -- 60 on hand, 14 reserved.
  addRow({ productId: 'p-004', onHand: 60, reserved: 14, reorderLevel: 30 })
  batches.push({
    id: `b-bkk-${batches.length + 1}`,
    purchaseReceiptId: 'pr-seed',
    warehouseId: 'w-bkk',
    productId: 'p-004',
    batchCode: nextBatchCode(),
    quantityReceived: 60,
    quantityRemaining: 60,
    unitCostAmount: 4.0,
    receivedAt: nowIso(),
    expiresAt: addDays(2),
    isDamaged: false,
  })

  // Halal meal (MOML) -- 10 on hand, 18 reserved (over-reserved on purpose,
  // so the Stock page shows available < 0 with a Reorder badge).
  addRow({ productId: 'p-005', onHand: 10, reserved: 18, reorderLevel: 30 })
  batches.push({
    id: `b-bkk-${batches.length + 1}`,
    purchaseReceiptId: 'pr-seed',
    warehouseId: 'w-bkk',
    productId: 'p-005',
    batchCode: nextBatchCode(),
    quantityReceived: 10,
    quantityRemaining: 10,
    unitCostAmount: 4.4,
    receivedAt: nowIso(),
    expiresAt: addDays(2),
    isDamaged: false,
  })

  // Wagyu beef bowl -- 9 on hand, 12 reserved (over-reserved).
  addRow({ productId: 'p-007', onHand: 9, reserved: 12, reorderLevel: 10 })
  batches.push({
    id: `b-bkk-${batches.length + 1}`,
    purchaseReceiptId: 'pr-seed',
    warehouseId: 'w-bkk',
    productId: 'p-007',
    batchCode: nextBatchCode(),
    quantityReceived: 9,
    quantityRemaining: 9,
    unitCostAmount: 10.5,
    receivedAt: nowIso(),
    expiresAt: addDays(2),
    isDamaged: false,
  })

  // Cold brew coffee -- 300 on hand, 40 reserved.
  addRow({ productId: 'p-009', onHand: 300, reserved: 40, reorderLevel: 120 })
  batches.push({
    id: `b-bkk-${batches.length + 1}`,
    purchaseReceiptId: 'pr-seed',
    warehouseId: 'w-bkk',
    productId: 'p-009',
    batchCode: nextBatchCode(),
    quantityReceived: 300,
    quantityRemaining: 300,
    unitCostAmount: 1.5,
    receivedAt: nowIso(),
    expiresAt: addDays(60),
    isDamaged: false,
  })

  // Jasmine eau de parfum -- 16 on hand, 2 reserved.
  addRow({ productId: 'p-010', onHand: 16, reserved: 2, reorderLevel: 10 })
  batches.push({
    id: `b-bkk-${batches.length + 1}`,
    purchaseReceiptId: 'pr-seed',
    warehouseId: 'w-bkk',
    productId: 'p-010',
    batchCode: nextBatchCode(),
    quantityReceived: 16,
    quantityRemaining: 16,
    unitCostAmount: 18.0,
    receivedAt: nowIso(),
    expiresAt: null, // duty-free has no expiry
    isDamaged: false,
  })

  return { stock, batches }
}

function seedOtherWarehouses(): { stock: WarehouseStockRow[]; batches: StockBatch[] } {
  const stock: WarehouseStockRow[] = []
  const batches: StockBatch[] = []
  const warehouseDefaults: Array<{ warehouseId: string; products: string[] }> = [
    { warehouseId: 'w-nrt', products: ['p-001', 'p-002', 'p-009'] },
    { warehouseId: 'w-hkg', products: ['p-001', 'p-008', 'p-011'] },
    { warehouseId: 'w-sin', products: ['p-002', 'p-009', 'p-012'] },
  ]
  for (const wh of warehouseDefaults) {
    for (const productId of wh.products) {
      const product = productById(productId)
      if (!product) continue
      const onHand = 100
      stock.push({
        id: `ws-${wh.warehouseId}-${productId}`,
        warehouseId: wh.warehouseId,
        productId: product.id,
        productName: product.name,
        productCategory: product.category,
        quantityOnHand: onHand,
        quantityReserved: 0,
        reorderLevel: 30,
      })
      batches.push({
        id: `b-${wh.warehouseId}-${productId}-1`,
        purchaseReceiptId: 'pr-seed',
        warehouseId: wh.warehouseId,
        productId: product.id,
        batchCode: 'B-001',
        quantityReceived: onHand,
        quantityRemaining: onHand,
        unitCostAmount: product.purchaseCostAmount ?? 0,
        receivedAt: nowIso(),
        expiresAt: product.category === 'duty_free' ? null : addDays(2),
        isDamaged: false,
      })
    }
  }
  return { stock, batches }
}

const seededBkk = seedBkkStock()
const seededOther = seedOtherWarehouses()

const store: StockStore = {
  stock: [...seededBkk.stock, ...seededOther.stock],
  batches: [...seededBkk.batches, ...seededOther.batches],
  movements: [],
  receipts: [],
  // Resume counters from however many batches we seeded for BKK so the next
  // generated code is one above the last B-00N we wrote.
  batchCounters: { 'w-bkk': seededBkk.batches.length },
  aircraftStock: [],
  stockTransfers: [],
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`
}

function nextBatchCode(warehouseId: string): string {
  const current = store.batchCounters[warehouseId] ?? 0
  const next = current + 1
  store.batchCounters[warehouseId] = next
  return `B-${String(next).padStart(3, '0')}`
}

// -- Read helpers used by the api layer --------------------------------------

export function snapshotWarehouses(): Warehouse[] {
  return mockWarehouses.map((w) => ({ ...w }))
}
export function snapshotSuppliers(airportCode?: string): Supplier[] {
  return mockSuppliers.filter((s) => (airportCode ? s.airportCode === airportCode : true)).map((s) => ({ ...s }))
}

export function snapshotWarehouseStock(warehouseId: string, lowOnly = false): WarehouseStockRow[] {
  return store.stock
    .filter((row) => row.warehouseId === warehouseId)
    .filter((row) => (lowOnly ? row.quantityOnHand - row.quantityReserved < row.reorderLevel : true))
    .map((row) => ({ ...row }))
}

export function snapshotStockBatches(opts: { warehouseId?: string; productId?: string }): StockBatch[] {
  return store.batches
    .filter((b) => (opts.warehouseId ? b.warehouseId === opts.warehouseId : true))
    .filter((b) => (opts.productId ? b.productId === opts.productId : true))
    .map((b) => ({ ...b }))
}

export function snapshotStockMovements(opts: { warehouseId?: string; productId?: string; flightId?: string }): StockMovement[] {
  return store.movements
    .filter((m) => (opts.warehouseId ? m.warehouseId === opts.warehouseId : true))
    .filter((m) => (opts.productId ? m.productId === opts.productId : true))
    .filter((m) => (opts.flightId ? m.flightId === opts.flightId : true))
    .map((m) => ({ ...m }))
}

export function snapshotPurchaseReceipts(opts: { warehouseId?: string }): PurchaseReceipt[] {
  return store.receipts
    .filter((r) => (opts.warehouseId ? r.warehouseId === opts.warehouseId : true))
    .map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })) }))
}

// Used by the Catering Orders page to show the "In warehouse" column and
// to compute shortfalls. Always returns a non-negative integer (clamps at
// zero so an over-reserved product still shows OK or zero, never negative).
export function getAvailableStock(warehouseId: string, productId: string): number {
  const row = findStockRow(warehouseId, productId)
  if (!row) return 0
  return Math.max(0, row.quantityOnHand - row.quantityReserved)
}

// -- Mutations ---------------------------------------------------------------

function findStockRow(warehouseId: string, productId: string): WarehouseStockRow | null {
  return store.stock.find((r) => r.warehouseId === warehouseId && r.productId === productId) ?? null
}

function ensureStockRow(warehouseId: string, productId: string): WarehouseStockRow {
  const existing = findStockRow(warehouseId, productId)
  if (existing) return existing
  const product = productById(productId)
  if (!product) throw new StockApiError('NOT_FOUND', 'Product not found.')
  const created: WarehouseStockRow = {
    id: nextId('ws'),
    warehouseId,
    productId,
    productName: product.name,
    productCategory: product.category,
    quantityOnHand: 0,
    quantityReserved: 0,
    reorderLevel: 0,
  }
  store.stock.push(created)
  return created
}

export class StockApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'StockApiError'
  }
}

export function receiveDelivery(input: CreatePurchaseReceiptInput): PurchaseReceipt {
  if (input.lines.length === 0) {
    throw new StockApiError('EMPTY_RECEIPT', 'Add at least one item before confirming the delivery.')
  }
  const warehouse = mockWarehouses.find((w) => w.id === input.warehouseId)
  if (!warehouse) throw new StockApiError('NOT_FOUND', 'Warehouse not found.')
  const supplier = mockSuppliers.find((s) => s.id === input.supplierId && s.airportCode === warehouse.airportCode)
  if (!supplier || !supplier.isActive) {
    throw new StockApiError('SUPPLIER_INVALID', 'Pick an active supplier for this airport.')
  }

  // Validate each line, then create the receipt, the batches and the
  // receive movements in one pass.
  const seenProducts = new Set<string>()
  for (const line of input.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new StockApiError('LINE_INVALID', 'Each row needs a quantity greater than zero.')
    }
    if (!Number.isFinite(line.unitCostAmount) || line.unitCostAmount < 0) {
      throw new StockApiError('LINE_INVALID', 'Unit cost must be 0 or more.')
    }
    if (seenProducts.has(line.productId)) {
      throw new StockApiError('DUPLICATE_PRODUCT', 'You can only receive one batch per product on a single delivery.')
    }
    seenProducts.add(line.productId)
    const product = productById(line.productId)
    if (!product) throw new StockApiError('NOT_FOUND', 'Product not found.')
  }

  const receiptId = nextId('pr')
  const lines = input.lines.map((line) => {
    const product = productById(line.productId)
    if (!product) throw new StockApiError('NOT_FOUND', 'Product not found.')
    // Prefer the per-line date the user picked; fall back to the product's
    // shelf life (or null for duty-free) when the form left it blank.
    const fallback = product.category === 'duty_free' || !product.shelfLifeDays ? null : addDays(product.shelfLifeDays)
    const expiresAt = line.expiresAt === undefined || line.expiresAt === null || line.expiresAt === '' ? fallback : line.expiresAt
    const batchCode = nextBatchCode(warehouse.id)
    const batch: StockBatch = {
      id: nextId('b'),
      purchaseReceiptId: receiptId,
      warehouseId: warehouse.id,
      productId: product.id,
      batchCode,
      quantityReceived: line.quantity,
      quantityRemaining: line.quantity,
      unitCostAmount: line.unitCostAmount,
      receivedAt: nowIso(),
      expiresAt,
      isDamaged: false,
    }
    store.batches.push(batch)
    return {
      productId: product.id,
      productName: product.name,
      quantity: line.quantity,
      unitCostAmount: line.unitCostAmount,
      batchCode,
      expiresAt,
      lineTotal: line.quantity * line.unitCostAmount,
    }
  })

  for (const line of lines) {
    const row = ensureStockRow(warehouse.id, line.productId)
    row.quantityOnHand += line.quantity
    store.movements.push({
      id: nextId('mv'),
      productId: line.productId,
      warehouseId: warehouse.id,
      aircraftId: null,
      stockBatchId: null,
      stockTransferId: null,
      productOrderId: null,
      flightId: null,
      type: 'receive',
      quantity: line.quantity,
      reason: null,
      note: null,
      createdByStaffId: null,
      occurredAt: nowIso(),
    })
  }

  const receipt: PurchaseReceipt = {
    id: receiptId,
    supplierId: supplier.id,
    warehouseId: warehouse.id,
    receivedAt: nowIso(),
    receivedByStaffId: null,
    lines,
  }
  store.receipts.push(receipt)
  return { ...receipt, lines: lines.map((l) => ({ ...l })) }
}

export function adjustStock(input: AdjustStockInput): StockMovement {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new StockApiError('ADJUST_INVALID', 'Quantity must be greater than zero.')
  }
  if (input.reason === 'spoilage' || input.reason === 'damage' || input.reason === 'expired' || input.reason === 'count_correction') {
    /* ok */
  } else {
    throw new StockApiError('REASON_REQUIRED', 'Pick a reason for this adjustment.')
  }
  const row = findStockRow(input.warehouseId, input.productId)
  if (!row) throw new StockApiError('NOT_FOUND', 'No stock for this product in this warehouse.')
  // We must not take on hand below reserved, otherwise the reserved units
  // would have nothing backing them.
  if (input.quantity > row.quantityOnHand - row.quantityReserved) {
    throw new StockApiError(
      'ADJUST_BELOW_RESERVED',
      `Only ${Math.max(0, row.quantityOnHand - row.quantityReserved)} units are available (${row.quantityReserved} are reserved).`,
    )
  }
  // Earliest-expiring batch first; take from quantity_remaining.
  const candidates = store.batches
    .filter((b) => b.warehouseId === input.warehouseId && b.productId === input.productId && b.quantityRemaining > 0)
    .sort((a, b) => {
      if (a.expiresAt == null && b.expiresAt == null) return 0
      if (a.expiresAt == null) return 1
      if (b.expiresAt == null) return -1
      return a.expiresAt.localeCompare(b.expiresAt)
    })
  let remaining = input.quantity
  for (const batch of candidates) {
    if (remaining <= 0) break
    const take = Math.min(batch.quantityRemaining, remaining)
    batch.quantityRemaining -= take
    remaining -= take
  }
  if (remaining > 0) {
    // Should not happen because we checked on hand above, but be defensive.
    throw new StockApiError('BATCH_SHORT', 'No batched stock available to take from.')
  }
  row.quantityOnHand -= input.quantity
  const movement: StockMovement = {
    id: nextId('mv'),
    productId: input.productId,
    warehouseId: input.warehouseId,
    aircraftId: null,
    stockBatchId: null,
    stockTransferId: null,
    productOrderId: null,
    flightId: null,
    type: 'adjust',
    quantity: -input.quantity,
    reason: input.reason,
    note: input.note,
    createdByStaffId: null,
    occurredAt: nowIso(),
  }
  store.movements.push(movement)
  return { ...movement }
}

export function writeOffExpiredBatches(warehouseId?: string): StockMovement[] {
  const now = nowIso()
  const written: StockMovement[] = []
  for (const batch of store.batches) {
    if (warehouseId && batch.warehouseId !== warehouseId) continue
    if (batch.quantityRemaining <= 0) continue
    if (batch.expiresAt == null) continue
    if (batch.expiresAt > now) continue
    const qty = batch.quantityRemaining
    batch.quantityRemaining = 0
    const row = findStockRow(batch.warehouseId, batch.productId)
    if (row) row.quantityOnHand = Math.max(0, row.quantityOnHand - qty)
    const movement: StockMovement = {
      id: nextId('mv'),
      productId: batch.productId,
      warehouseId: batch.warehouseId,
      aircraftId: null,
      stockBatchId: batch.id,
      stockTransferId: null,
      productOrderId: null,
      flightId: null,
      type: 'adjust',
      quantity: -qty,
      reason: 'expired',
      note: null,
      createdByStaffId: null,
      occurredAt: nowIso(),
    }
    store.movements.push(movement)
    written.push({ ...movement })
  }
  return written
}

// -- Warehouse + Supplier CRUD ----------------------------------------------
// Both arrays are module-level mutable so the UI can add/remove/edit them
// without a page reload. The store keeps `mockWarehouses` and `mockSuppliers`
// as the source of truth, exposed through the snapshot helpers above.

export function addWarehouse(input: Omit<Warehouse, 'id'>): Warehouse {
  const code = input.code.trim().toUpperCase()
  if (code === '') throw new StockApiError('WAREHOUSE_INVALID', 'Airport code is required.')
  if (mockWarehouses.some((w) => w.code === code)) {
    throw new StockApiError('WAREHOUSE_DUPLICATE', `Airport ${code} already exists.`)
  }
  const created: Warehouse = { id: `w-${code.toLowerCase()}-${Date.now().toString(36)}`, code, name: input.name.trim(), airportCode: code }
  mockWarehouses.push(created)
  return { ...created }
}

export function updateWarehouse(id: string, input: Partial<Omit<Warehouse, 'id'>>): Warehouse {
  const idx = mockWarehouses.findIndex((w) => w.id === id)
  if (idx === -1) throw new StockApiError('NOT_FOUND', 'Warehouse not found.')
  const next: Warehouse = { ...mockWarehouses[idx] }
  if (input.code != null) {
    const code = input.code.trim().toUpperCase()
    if (code === '') throw new StockApiError('WAREHOUSE_INVALID', 'Airport code is required.')
    if (code !== next.code && mockWarehouses.some((w) => w.code === code)) {
      throw new StockApiError('WAREHOUSE_DUPLICATE', `Airport ${code} already exists.`)
    }
    next.code = code
    next.airportCode = code
  }
  if (input.name != null) next.name = input.name.trim()
  mockWarehouses[idx] = next
  return { ...next }
}

export function removeWarehouse(id: string): void {
  const idx = mockWarehouses.findIndex((w) => w.id === id)
  if (idx === -1) throw new StockApiError('NOT_FOUND', 'Warehouse not found.')
  if (store.stock.some((r) => r.warehouseId === id)) {
    throw new StockApiError('WAREHOUSE_IN_USE', 'This warehouse still has stock. Adjust or transfer the stock first.')
  }
  if (store.batches.some((b) => b.warehouseId === id && b.quantityRemaining > 0)) {
    throw new StockApiError('WAREHOUSE_IN_USE', 'This warehouse still has batches with stock remaining.')
  }
  mockWarehouses.splice(idx, 1)
}

export function addSupplier(input: Omit<Supplier, 'id'>): Supplier {
  const name = input.name.trim()
  if (name === '') throw new StockApiError('SUPPLIER_INVALID', 'Supplier name is required.')
  const airportCode = input.airportCode.trim().toUpperCase()
  const airport = mockWarehouses.find((w) => w.code === airportCode)
  if (!airport) throw new StockApiError('SUPPLIER_INVALID', `No airport with code ${airportCode}.`)
  if (mockSuppliers.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.airportCode === airportCode)) {
    throw new StockApiError('SUPPLIER_DUPLICATE', `Supplier ${name} already exists for ${airportCode}.`)
  }
  const created: Supplier = {
    id: `s-${airportCode.toLowerCase()}-${Date.now().toString(36)}`,
    name,
    airportCode,
    contact: input.contact?.trim() === '' ? null : (input.contact?.trim() ?? null),
    isActive: input.isActive,
  }
  mockSuppliers.push(created)
  return { ...created }
}

export function updateSupplier(id: string, input: Partial<Omit<Supplier, 'id'>>): Supplier {
  const idx = mockSuppliers.findIndex((s) => s.id === id)
  if (idx === -1) throw new StockApiError('NOT_FOUND', 'Supplier not found.')
  const next: Supplier = { ...mockSuppliers[idx] }
  if (input.name != null) {
    const name = input.name.trim()
    if (name === '') throw new StockApiError('SUPPLIER_INVALID', 'Supplier name is required.')
    if (
      name.toLowerCase() !== next.name.toLowerCase() &&
      mockSuppliers.some((s) => s.airportCode === next.airportCode && s.name.toLowerCase() === name.toLowerCase())
    ) {
      throw new StockApiError('SUPPLIER_DUPLICATE', `Supplier ${name} already exists for ${next.airportCode}.`)
    }
    next.name = name
  }
  if (input.contact !== undefined) {
    next.contact = input.contact?.trim() === '' ? null : (input.contact?.trim() ?? null)
  }
  if (input.isActive != null) next.isActive = input.isActive
  mockSuppliers[idx] = next
  return { ...next }
}

export function removeSupplier(id: string): void {
  const idx = mockSuppliers.findIndex((s) => s.id === id)
  if (idx === -1) throw new StockApiError('NOT_FOUND', 'Supplier not found.')
  if (store.receipts.some((r) => r.supplierId === id)) {
    throw new StockApiError('SUPPLIER_IN_USE', 'This supplier has past deliveries on record. Mark it inactive instead.')
  }
  mockSuppliers.splice(idx, 1)
}

// -- Aircraft stock + stock transfers --------------------------------------
// Both arrays are module-level mutable. The Catering Orders page calls
// createStockTransfer to move the earliest-expiring valid batches from
// the flight's departure warehouse onto the aircraft. Each unit becomes
// one stock_movement at the warehouse (negative) and one at the aircraft
// (positive), and an aircraft_stock row per (aircraft, product, batch).

export function snapshotAircraftStock(aircraftId: string): AircraftStockRow[] {
  return store.aircraftStock.filter((r) => r.aircraftId === aircraftId).map((r) => ({ ...r }))
}

export function snapshotStockTransfers(opts: { flightId?: string } = {}): StockTransfer[] {
  return store.stockTransfers
    .filter((t) => (opts.flightId ? t.flightId === opts.flightId : true))
    .map((t) => ({ ...t, lines: t.lines.map((l) => ({ ...l })) }))
}

interface TransferRequest {
  flightId: string
  aircraftId: string
  warehouseId: string
  // Each entry: product + the quantity to pull from this warehouse.
  // The store takes earliest-expiry first across the warehouse's batches.
  lines: Array<{ productId: string; quantity: number }>
}

function takeFromBatches(opts: { warehouseId: string; productId: string; quantity: number; nowIso: string }): {
  taken: Array<{ batchId: string; quantity: number }>
  remainingNeeded: number
} {
  const { warehouseId, productId, quantity, nowIso } = opts
  // Earliest-expiring valid batch first; null expiry sorts last (duty-free).
  // Damaged and already-expired batches are refused.
  const candidates = store.batches
    .filter((b) => b.warehouseId === warehouseId && b.productId === productId && b.quantityRemaining > 0)
    .filter((b) => !b.isDamaged)
    .filter((b) => b.expiresAt == null || b.expiresAt > nowIso)
    .sort((a, b) => {
      if (a.expiresAt == null && b.expiresAt == null) return 0
      if (a.expiresAt == null) return 1
      if (b.expiresAt == null) return -1
      return a.expiresAt.localeCompare(b.expiresAt)
    })
  let remaining = quantity
  const taken: Array<{ batchId: string; quantity: number }> = []
  for (const batch of candidates) {
    if (remaining <= 0) break
    const take = Math.min(batch.quantityRemaining, remaining)
    batch.quantityRemaining -= take
    remaining -= take
    taken.push({ batchId: batch.id, quantity: take })
  }
  return { taken, remainingNeeded: remaining }
}

export function transferToAircraft(req: TransferRequest): StockTransfer {
  const nowIso = '2026-10-08T09:00:00Z'
  const warehouse = mockWarehouses.find((w) => w.id === req.warehouseId)
  if (!warehouse) throw new StockApiError('NO_WAREHOUSE_FOR_AIRPORT', 'No warehouse for this flight.')
  const transferId = nextId('st')
  const transferLines: StockTransferLine[] = []
  const movements: StockMovement[] = []

  for (const line of req.lines) {
    if (line.quantity <= 0) continue
    const { taken, remainingNeeded } = takeFromBatches({
      warehouseId: req.warehouseId,
      productId: line.productId,
      quantity: line.quantity,
      nowIso,
    })
    if (taken.length === 0 || remainingNeeded > 0) {
      // Could not source a valid (unexpired, undamaged) batch for the line.
      // Roll back the per-batch deductions we already made on previous lines
      // by leaving them in place; they're harmless and the caller can retry.
      throw new StockApiError(
        'BATCH_EXPIRED',
        remainingNeeded > 0
          ? `No valid batch available for product ${line.productId} in ${warehouse.code}.`
          : `No unexpired batch available for product ${line.productId} in ${warehouse.code}.`,
      )
    }
    for (const piece of taken) {
      transferLines.push({ productId: line.productId, stockBatchId: piece.batchId, quantity: piece.quantity })
      // Bump aircraft stock. If a row for this batch already exists, add to it.
      const existing = store.aircraftStock.find(
        (r) => r.aircraftId === req.aircraftId && r.productId === line.productId && r.stockBatchId === piece.batchId,
      )
      if (existing) {
        existing.quantity += piece.quantity
      } else {
        const batch = store.batches.find((b) => b.id === piece.batchId)
        const product = productById(line.productId)
        store.aircraftStock.push({
          id: nextId('as'),
          aircraftId: req.aircraftId,
          productId: line.productId,
          productName: product?.name ?? line.productId,
          stockBatchId: piece.batchId,
          batchCode: batch?.batchCode ?? '',
          quantity: piece.quantity,
          expiresAt: batch?.expiresAt ?? null,
        })
      }
    }
    // Lower warehouse stock for this line. Reserved goes down first
    // (the order was already reserved), then on hand.
    const stockRow = findStockRow(req.warehouseId, line.productId)
    if (stockRow) {
      const reservedDrop = Math.min(stockRow.quantityReserved, line.quantity)
      stockRow.quantityReserved = Math.max(0, stockRow.quantityReserved - reservedDrop)
      stockRow.quantityOnHand = Math.max(0, stockRow.quantityOnHand - line.quantity)
    }
    // Two movements per line: out at warehouse, in at aircraft.
    const ts = nowIso
    movements.push({
      id: nextId('mv'),
      productId: line.productId,
      warehouseId: req.warehouseId,
      aircraftId: null,
      stockBatchId: null,
      stockTransferId: transferId,
      productOrderId: null,
      flightId: req.flightId,
      type: 'transfer',
      quantity: -line.quantity,
      reason: null,
      note: null,
      createdByStaffId: null,
      occurredAt: ts,
    })
    movements.push({
      id: nextId('mv'),
      productId: line.productId,
      warehouseId: null,
      aircraftId: req.aircraftId,
      stockBatchId: null,
      stockTransferId: transferId,
      productOrderId: null,
      flightId: req.flightId,
      type: 'transfer',
      quantity: line.quantity,
      reason: null,
      note: null,
      createdByStaffId: null,
      occurredAt: ts,
    })
  }

  for (const m of movements) store.movements.push(m)
  const transfer: StockTransfer = {
    id: transferId,
    flightId: req.flightId,
    aircraftId: req.aircraftId,
    warehouseId: req.warehouseId,
    transferredAt: nowIso,
    lines: transferLines,
  }
  store.stockTransfers.push(transfer)
  return { ...transfer, lines: transferLines.map((l) => ({ ...l })) }
}

// -- Aircraft stock discard (completion rules) ----------------------------
// Used by the Flight Report page to apply the spec's completion rules
// (meals -> 0, snacks/beverages/duty-free -> keep unless batch invalid).
// Decrements aircraft_stock across rows for the same product (earliest-
// expiry first) and writes one discard stock_movement per call.

export function discardAircraftStock(aircraftId: string, productId: string, quantity: number): number {
  if (quantity <= 0) return 0
  const nowIso = '2026-10-08T09:00:00Z'
  const rows = store.aircraftStock
    .filter((r) => r.aircraftId === aircraftId && r.productId === productId && r.quantity > 0)
    .sort((a, b) => {
      if (a.expiresAt == null && b.expiresAt == null) return 0
      if (a.expiresAt == null) return 1
      if (b.expiresAt == null) return -1
      return a.expiresAt.localeCompare(b.expiresAt)
    })
  let remaining = quantity
  for (const row of rows) {
    if (remaining <= 0) break
    const take = Math.min(row.quantity, remaining)
    row.quantity -= take
    remaining -= take
    store.movements.push({
      id: nextId('mv'),
      productId,
      warehouseId: null,
      aircraftId,
      stockBatchId: row.stockBatchId,
      stockTransferId: null,
      productOrderId: null,
      flightId: null,
      type: 'discard',
      quantity: -take,
      reason: null,
      note: null,
      createdByStaffId: null,
      occurredAt: nowIso,
    })
  }
  return quantity - remaining
}

// -- Aircraft stock seed ---------------------------------------------------
// The Flight Report page needs aircraft stock rows for the reportable
// flights. Real flows would go through Catering Orders -> Transfer to
// aircraft, but the Flight Report needs something to report on without
// forcing the user through that path first. Run once on module load.

function seedAircraftStock(): AircraftStockRow[] {
  const rows: AircraftStockRow[] = []
  // Pick a batch for a warehouse + product; returns the first matching
  // batch id (or null). Used to anchor the pre-seeded aircraft stock.
  const pickBatch = (warehouseId: string, productId: string): { batchId: string; batchCode: string; expiresAt: string | null } | null => {
    const batch = store.batches.find((b) => b.warehouseId === warehouseId && b.productId === productId)
    if (!batch) return null
    return { batchId: batch.id, batchCode: batch.batchCode, expiresAt: batch.expiresAt }
  }

  // f-401 (BKK → NRT, business). BKK warehouse, mirror the catering
  // order lines: 22 p-002, 8 p-004, 30 p-009.
  const f401Aircraft = 'a-fya'
  const f401Lines: Array<{ productId: string; quantity: number }> = [
    { productId: 'p-002', quantity: 22 },
    { productId: 'p-004', quantity: 8 },
    { productId: 'p-009', quantity: 30 },
  ]
  for (const l of f401Lines) {
    const batch = pickBatch('w-bkk', l.productId)
    if (!batch) continue
    rows.push({
      id: nextId('as'),
      aircraftId: f401Aircraft,
      productId: l.productId,
      productName: mockProducts.find((p) => p.id === l.productId)?.name ?? l.productId,
      stockBatchId: batch.batchId,
      batchCode: batch.batchCode,
      quantity: l.quantity,
      expiresAt: batch.expiresAt,
    })
  }

  // f-405 (SIN → BKK, economy). BKK warehouse. The eco lines for 135 pax
  // are roughly: 68 p-001, 41 p-002, 9 p-004, 12 p-005, 12 p-002, 40 p-009.
  const f405Aircraft = 'a-fya'
  const f405Lines: Array<{ productId: string; quantity: number }> = [
    { productId: 'p-001', quantity: 68 },
    { productId: 'p-002', quantity: 53 }, // 41 economy + 12 business
    { productId: 'p-004', quantity: 9 },
    { productId: 'p-005', quantity: 12 },
    { productId: 'p-009', quantity: 40 },
  ]
  for (const l of f405Lines) {
    const batch = pickBatch('w-bkk', l.productId)
    if (!batch) continue
    rows.push({
      id: nextId('as'),
      aircraftId: f405Aircraft,
      productId: l.productId,
      productName: mockProducts.find((p) => p.id === l.productId)?.name ?? l.productId,
      stockBatchId: batch.batchId,
      batchCode: batch.batchCode,
      quantity: l.quantity,
      expiresAt: batch.expiresAt,
    })
  }

  // f-308 (BKK → NRT, economy). BKK warehouse. Mirrors the FY307
  // prototype: 96 p-001, 64 p-002, 14 p-004, 18 p-005, 12 p-007, 40 p-009.
  // Add a small p-008 (snack) row so the read-only Sold column is
  // non-empty when the user later records sales of p-008.
  const f308Aircraft = 'a-fya'
  const f308Lines: Array<{ productId: string; quantity: number }> = [
    { productId: 'p-001', quantity: 96 },
    { productId: 'p-002', quantity: 64 },
    { productId: 'p-004', quantity: 14 },
    { productId: 'p-005', quantity: 18 },
    { productId: 'p-007', quantity: 12 },
    { productId: 'p-008', quantity: 30 },
    { productId: 'p-009', quantity: 40 },
  ]
  for (const l of f308Lines) {
    const batch = pickBatch('w-bkk', l.productId)
    if (!batch) continue
    rows.push({
      id: nextId('as'),
      aircraftId: f308Aircraft,
      productId: l.productId,
      productName: mockProducts.find((p) => p.id === l.productId)?.name ?? l.productId,
      stockBatchId: batch.batchId,
      batchCode: batch.batchCode,
      quantity: l.quantity,
      expiresAt: batch.expiresAt,
    })
  }
  return rows
}

// store is declared above as a const; mutate it in-place to add the
// seed rows. The store literal is hoisted but its `aircraftStock`
// array can be appended to from the IIFE below.
;(function applyAircraftStockSeed() {
  const seeded = seedAircraftStock()
  for (const r of seeded) store.aircraftStock.push(r)
})()
