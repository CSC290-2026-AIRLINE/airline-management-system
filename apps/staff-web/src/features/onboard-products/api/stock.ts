// API for warehouse stock, suppliers, batches, movements, and purchase
// receipts. Names follow the /staff/warehouse-stock, /staff/warehouses,
// /staff/suppliers, /staff/stock-batches, /staff/stock-movements and
// /staff/purchase-receipts routes from the F12 spec.

import { delay } from '../mocks/delay'
import {
  addSupplier,
  addWarehouse,
  adjustStock,
  receiveDelivery,
  removeSupplier,
  removeWarehouse,
  snapshotPurchaseReceipts,
  snapshotStockBatches,
  snapshotStockMovements,
  snapshotSuppliers,
  snapshotWarehouseStock,
  snapshotWarehouses,
  updateSupplier as updateSupplierStore,
  updateWarehouse as updateWarehouseStore,
  writeOffExpiredBatches,
  StockApiError,
} from '../mocks/stock'
import type {
  AdjustStockInput,
  CreatePurchaseReceiptInput,
  PurchaseReceipt,
  StockBatch,
  StockMovement,
  Supplier,
  Warehouse,
  WarehouseStockRow,
} from './types'

// -- Typed errors ------------------------------------------------------------
// Mirrors the spec's `{ error: { code, message } }` envelope so swapping
// the mock for a real backend is a one-file change.

export { StockApiError }

// -- Warehouses --------------------------------------------------------------

export async function listWarehouses(): Promise<Warehouse[]> {
  await delay()
  return snapshotWarehouses()
}

export async function createWarehouse(input: Omit<Warehouse, 'id'>): Promise<Warehouse> {
  await delay()
  return addWarehouse(input)
}

export async function updateWarehouse(id: string, input: Partial<Omit<Warehouse, 'id'>>): Promise<Warehouse> {
  await delay()
  return updateWarehouseStore(id, input)
}

export async function deleteWarehouse(id: string): Promise<void> {
  await delay()
  removeWarehouse(id)
}

// -- Suppliers ---------------------------------------------------------------

export async function listSuppliers(airportCode?: string): Promise<Supplier[]> {
  await delay()
  return snapshotSuppliers(airportCode)
}

export async function createSupplier(input: Omit<Supplier, 'id'>): Promise<Supplier> {
  await delay()
  return addSupplier(input)
}

export async function updateSupplier(id: string, input: Partial<Omit<Supplier, 'id'>>): Promise<Supplier> {
  await delay()
  return updateSupplierStore(id, input)
}

export async function deleteSupplier(id: string): Promise<void> {
  await delay()
  removeSupplier(id)
}

// -- Warehouse stock ---------------------------------------------------------

export async function listWarehouseStock(warehouseId: string, lowOnly = false): Promise<WarehouseStockRow[]> {
  await delay()
  return snapshotWarehouseStock(warehouseId, lowOnly)
}

// -- Batches -----------------------------------------------------------------

export async function listStockBatches(opts: { warehouseId?: string; productId?: string; expiringBefore?: string }): Promise<StockBatch[]> {
  await delay()
  const all = snapshotStockBatches({ warehouseId: opts.warehouseId, productId: opts.productId })
  if (!opts.expiringBefore) return all
  return all.filter((b) => b.expiresAt != null && b.expiresAt <= opts.expiringBefore!)
}

// -- Purchase receipts -------------------------------------------------------

export async function createPurchaseReceipt(input: CreatePurchaseReceiptInput): Promise<PurchaseReceipt> {
  await delay()
  return receiveDelivery(input)
}

export async function listPurchaseReceipts(opts: { warehouseId?: string } = {}): Promise<PurchaseReceipt[]> {
  await delay()
  return snapshotPurchaseReceipts(opts)
}

// -- Stock movements ---------------------------------------------------------

export async function createStockMovement(input: AdjustStockInput): Promise<StockMovement> {
  await delay()
  return adjustStock(input)
}

export async function listStockMovements(
  opts: {
    warehouseId?: string
    productId?: string
    flightId?: string
  } = {},
): Promise<StockMovement[]> {
  await delay()
  return snapshotStockMovements(opts)
}

export async function writeOffExpiredBatchesNow(warehouseId?: string): Promise<StockMovement[]> {
  await delay()
  return writeOffExpiredBatches(warehouseId)
}
