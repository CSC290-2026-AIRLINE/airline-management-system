// Mock data for warehouse stock and related tables (warehouse, warehouse_stock, supplier).

import type { Supplier, Warehouse, WarehouseStockRow } from '../api/types'

export const mockWarehouses: Warehouse[] = [
  { id: 'w-bkk', code: 'BKK', name: 'Bangkok Warehouse', airportCode: 'BKK' },
  { id: 'w-nrt', code: 'NRT', name: 'Narita Warehouse', airportCode: 'NRT' },
]

export const mockSuppliers: Supplier[] = [
  { id: 's-001', name: 'Bangkok Catering Co.', airportCode: 'BKK', contact: '+66 2 555 0100', isActive: true },
  { id: 's-002', name: 'Tokyo Foods Ltd.', airportCode: 'NRT', contact: '+81 3 555 0200', isActive: true },
]

export const mockWarehouseStock: WarehouseStockRow[] = [
  {
    id: 'ws-1',
    warehouseId: 'w-bkk',
    productId: 'p-001',
    productName: 'Chicken with rice',
    quantityOnHand: 240,
    quantityReserved: 120,
    reorderLevel: 80,
  },
  {
    id: 'ws-2',
    warehouseId: 'w-bkk',
    productId: 'p-002',
    productName: 'Vegetarian pasta',
    quantityOnHand: 180,
    quantityReserved: 60,
    reorderLevel: 60,
  },
  {
    id: 'ws-3',
    warehouseId: 'w-bkk',
    productId: 'p-005',
    productName: 'Mixed nuts',
    quantityOnHand: 42,
    quantityReserved: 60,
    reorderLevel: 100,
  },
  {
    id: 'ws-4',
    warehouseId: 'w-bkk',
    productId: 'p-006',
    productName: 'Sparkling water 330ml',
    quantityOnHand: 600,
    quantityReserved: 0,
    reorderLevel: 200,
  },
]
