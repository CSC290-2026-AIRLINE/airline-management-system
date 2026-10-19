// Stock API: warehouses, suppliers, batches, stock movements, purchase
// receipts. Warehouse stock is derived from batches since the backend
// has no dedicated /warehouse-stock endpoint; the page can still show
// per-warehouse totals.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { StockApiError } from './errors'
import {
  mapPurchaseReceipt,
  mapStockBatch,
  mapStockMovement,
  mapSupplier,
  mapWarehouse,
  summarizeWarehouseStock,
  toPurchaseReceiptInput,
  toStockMovementInput,
  toSupplierInput,
  toWarehouseInput,
} from './mappers'
import type {
  CreatePurchaseReceiptInput,
  PurchaseReceipt,
  StockBatch,
  StockMovement,
  StockMovementReason,
  Supplier,
  Warehouse,
  WarehouseStockRow,
} from './types'
import type { Product } from './types'

export interface StockApi {
  listWarehouses: () => Promise<Warehouse[]>
  createWarehouse: (input: { code: string; name: string; airportCode: string }) => Promise<Warehouse>
  updateWarehouse: (id: string, input: Partial<{ code: string; name: string; airportCode: string }>) => Promise<Warehouse>
  deleteWarehouse: (id: string) => Promise<void>

  listSuppliers: (airportCode?: string) => Promise<Supplier[]>
  createSupplier: (input: { name: string; airportCode: string; contact: string | null; isActive: boolean }) => Promise<Supplier>
  updateSupplier: (
    id: string,
    input: Partial<{ name: string; airportCode: string; contact: string | null; isActive: boolean }>,
  ) => Promise<Supplier>
  deleteSupplier: (id: string) => Promise<void>

  listWarehouseStock: (warehouseId: string) => Promise<WarehouseStockRow[]>
  listStockBatches: (opts: { warehouseId?: string; productId?: string; expiringBefore?: string }) => Promise<StockBatch[]>
  listStockMovements: (opts: { warehouseId?: string; productId?: string; flightId?: string }) => Promise<StockMovement[]>
  listPurchaseReceipts: (opts: { warehouseId?: string }) => Promise<PurchaseReceipt[]>
  createPurchaseReceipt: (input: CreatePurchaseReceiptInput, products: Product[]) => Promise<PurchaseReceipt>
  createStockMovement: (input: {
    warehouseId: string
    productId: string
    quantity: number
    reason: NonNullable<StockMovementReason>
    note: string | null
  }) => Promise<StockMovement>
  writeOffExpiredBatchesNow: (warehouseId?: string) => Promise<StockMovement[]>
}

function rethrow(err: unknown, fallback: StockApiError): never {
  if (err instanceof StockApiError) throw err
  if (err instanceof ApiError) throw new StockApiError(err.code, err.message, err.status, err.details)
  throw fallback
}

export function createStockApi(client: ApiClient, productsRef: () => Product[]): StockApi {
  return {
    async listWarehouses() {
      try {
        const wire = await client.get<unknown[]>('/api/staff/warehouses')
        return (wire ?? []).map((w) => mapWarehouse(w as never))
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not load warehouses.', 0))
      }
    },
    async createWarehouse(input) {
      try {
        const wire = await client.put<unknown>('/api/staff/warehouses', toWarehouseInput(input))
        return mapWarehouse(wire as never)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not add the warehouse.', 0))
      }
    },
    async updateWarehouse(id, input) {
      try {
        const wire = await client.put<unknown>(`/api/staff/warehouses/${id}`, toWarehouseInput(input as never))
        return mapWarehouse(wire as never)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not save the warehouse.', 0))
      }
    },
    async deleteWarehouse(id) {
      try {
        await client.delete(`/api/staff/warehouses/${id}`)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not remove the warehouse.', 0))
      }
    },

    async listSuppliers(airportCode) {
      try {
        const wire = await client.get<unknown[]>('/api/staff/suppliers', { airportCode })
        return (wire ?? []).map((s) => mapSupplier(s as never))
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not load suppliers.', 0))
      }
    },
    async createSupplier(input) {
      try {
        const wire = await client.put<unknown>('/api/staff/suppliers', toSupplierInput(input))
        return mapSupplier(wire as never)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not add the supplier.', 0))
      }
    },
    async updateSupplier(id, input) {
      try {
        const wire = await client.put<unknown>(`/api/staff/suppliers/${id}`, input as Record<string, unknown>)
        return mapSupplier(wire as never)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not save the supplier.', 0))
      }
    },
    async deleteSupplier(id) {
      try {
        await client.delete(`/api/staff/suppliers/${id}`)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not remove the supplier.', 0))
      }
    },

    async listWarehouseStock(warehouseId) {
      try {
        const batches = await client.get<unknown[]>('/api/staff/stock-batches', { warehouseId })
        const list = (batches ?? []).map((b) => mapStockBatch(b as never))
        return summarizeWarehouseStock(warehouseId, productsRef(), list)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not load stock.', 0))
      }
    },
    async listStockBatches(opts) {
      try {
        const wire = await client.get<unknown[]>('/api/staff/stock-batches', {
          warehouseId: opts.warehouseId,
          productId: opts.productId,
          expiringBefore: opts.expiringBefore,
        })
        return (wire ?? []).map((b) => mapStockBatch(b as never))
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not load stock batches.', 0))
      }
    },
    async listStockMovements(opts) {
      try {
        const wire = await client.get<unknown[]>('/api/staff/stock-movements', {
          warehouseId: opts.warehouseId,
          productId: opts.productId,
          flightId: opts.flightId,
        })
        return (wire ?? []).map((m) => mapStockMovement(m as never))
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not load stock movements.', 0))
      }
    },
    async listPurchaseReceipts(opts) {
      try {
        const wire = await client.get<unknown[]>('/api/staff/purchase-receipts', { warehouseId: opts.warehouseId })
        return (wire ?? []).map((r) => mapPurchaseReceipt(r as never))
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not load purchase receipts.', 0))
      }
    },
    async createPurchaseReceipt(input, products) {
      const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id
      try {
        const wire = await client.put<unknown>('/api/staff/purchase-receipts', toPurchaseReceiptInput(input, nameOf))
        return mapPurchaseReceipt(wire as never)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not save the delivery.', 0))
      }
    },
    async createStockMovement(input) {
      try {
        const wire = await client.put<unknown>('/api/staff/stock-movements', toStockMovementInput(input))
        return mapStockMovement(wire as never)
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not adjust the stock.', 0))
      }
    },
    async writeOffExpiredBatchesNow(warehouseId) {
      try {
        const wire = await client.put<unknown[]>('/api/staff/stock-batches/write-off-expired', { warehouseId })
        // The endpoint returns the batches that were touched, not movements.
        // Movements are visible in the next list call.
        return (wire ?? []).map((m) => mapStockMovement(m as never))
      } catch (err) {
        rethrow(err, new StockApiError('UNKNOWN', 'Could not write off expired batches.', 0))
      }
    },
  }
}

export { StockApiError }

export function useStockApi(productsRef: () => Product[]): StockApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(
    () => createStockApi(new ApiClient(fetchWithAuth as ApiFetch), productsRef),
    // productsRef changes every render; re-creating the api each render
    // is fine because all callers go through this hook and the api is
    // cheap. The fetchWithAuth is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchWithAuth],
  )
}
