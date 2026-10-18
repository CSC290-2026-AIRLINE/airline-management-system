// API for warehouse stock. Mirrors /staff/warehouse-stock, /staff/warehouses, /staff/suppliers, /staff/stock-batches.

import { delay } from '../mocks/delay'
import { mockSuppliers, mockWarehouseStock, mockWarehouses } from '../mocks/stock'
import type { Supplier, Warehouse, WarehouseStockRow } from './types'

export async function listWarehouses(): Promise<Warehouse[]> {
  await delay()
  return mockWarehouses
}

export async function listSuppliers(airportCode?: string): Promise<Supplier[]> {
  await delay()
  return airportCode ? mockSuppliers.filter((s) => s.airportCode === airportCode) : mockSuppliers
}

export async function listWarehouseStock(warehouseId: string): Promise<WarehouseStockRow[]> {
  await delay()
  return mockWarehouseStock.filter((row) => row.warehouseId === warehouseId)
}
