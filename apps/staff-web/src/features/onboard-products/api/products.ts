// Products API: real backend wiring. Each function is a thin wrapper
// around `ApiClient` calls, with input mapping (UI → wire) and output
// mapping (wire → UI) in `mappers.ts`. Typed errors come from
// `errors.ts` and surface the spec code to the pages.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { ImageInvalidError, ProductApiError, ProductInUseError } from './errors'
import { MissingIdError, requireId } from './guards'
import { mapProduct, toProductDraft, type ProductDraftInput } from './mappers'
import type { Product } from './types'

export interface ProductsApi {
  list: () => Promise<Product[]>
  get: (id: string) => Promise<Product | null>
  create: (input: ProductDraftInput) => Promise<Product>
  update: (id: string, input: ProductDraftInput) => Promise<Product>
  delete: (id: string) => Promise<void>
  setActive: (id: string, isActive: boolean) => Promise<Product>
}

function rethrow(err: unknown, fallback: ProductApiError): never {
  if (err instanceof ProductApiError) throw err
  if (err instanceof ApiError) {
    if (err.code === 'IMAGE_INVALID') throw new ImageInvalidError(err.message, err.details)
    if (err.code === 'PRODUCT_IN_USE') throw new ProductInUseError(err.message, err.details)
    throw new ProductApiError(err.code, err.message, err.status, err.details)
  }
  throw fallback
}

export function createProductsApi(client: ApiClient): ProductsApi {
  return {
    async list() {
      try {
        const wire = await client.get<unknown[]>('/api/staff/products')
        return (wire ?? []).map((w) => mapProduct(w as never))
      } catch (err) {
        rethrow(err, new ProductApiError('UNKNOWN', err instanceof Error ? err.message : 'Could not load products.', 0))
      }
    },
    async get(id) {
      try {
        requireId('GET /api/staff/products/:id', 'id', id)
        const wire = await client.get<unknown>(`/api/staff/products/${id}`)
        return wire ? mapProduct(wire as never) : null
      } catch (err) {
        if (err instanceof MissingIdError) return null
        if (err instanceof ApiError && err.status === 404) return null
        rethrow(err, new ProductApiError('NOT_FOUND', 'Product not found.', 0))
      }
    },
    async create(input) {
      try {
        const body = await client.put<{ product: unknown }>('/api/staff/products', toProductDraft(input))
        return mapProduct(body.product as never)
      } catch (err) {
        rethrow(err, new ProductApiError('UNKNOWN', 'Could not save the product.', 0))
      }
    },
    async update(id, input) {
      try {
        requireId('PUT /api/staff/products/:id', 'id', id)
        const body = await client.put<{ product: unknown }>(`/api/staff/products/${id}`, toProductDraft(input))
        return mapProduct(body.product as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new ProductApiError('NOT_FOUND', 'Product not found.', 0))
        }
        rethrow(err, new ProductApiError('UNKNOWN', 'Could not save the product.', 0))
      }
    },
    async delete(id) {
      try {
        requireId('DELETE /api/staff/products/:id', 'id', id)
        await client.delete(`/api/staff/products/${id}`)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new ProductApiError('NOT_FOUND', 'Product not found.', 0))
        }
        rethrow(err, new ProductApiError('UNKNOWN', 'Could not delete the product.', 0))
      }
    },
    async setActive(id, isActive) {
      try {
        requireId('PUT /api/staff/products/:id (setActive)', 'id', id)
        const body = await client.put<{ product: unknown }>(`/api/staff/products/${id}`, { isActive })
        return mapProduct(body.product as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new ProductApiError('NOT_FOUND', 'Product not found.', 0))
        }
        rethrow(err, new ProductApiError('UNKNOWN', 'Could not change the status.', 0))
      }
    },
  }
}

// Re-exports so the page can keep its named imports working.
export { ImageInvalidError, ProductApiError, ProductInUseError }

export function useProductsApi(): ProductsApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => createProductsApi(new ApiClient(fetchWithAuth as ApiFetch)), [fetchWithAuth])
}
