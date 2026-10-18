// API for the product catalog. Mirrors /staff/products.
//
// The mock layer keeps an in-memory store keyed by id. Adds, edits, toggles and
// deletes persist while the user navigates between pages, and reset on page
// reload. When the real backend lands, replace each function body with a
// fetchWithAuth call to the matching route -- the public signatures match the
// spec so the page does not change.

import { delay } from '../mocks/delay'
import { mockProducts } from '../mocks/products'
import type { Product, ProductInput } from './types'

// Module-level mutable store. Cloned so callers can't mutate it by reference.
const store: Product[] = mockProducts.map((p) => ({ ...p, dietaryAttributes: [...p.dietaryAttributes] }))

function snapshot(): Product[] {
  return store.map((p) => ({ ...p, dietaryAttributes: [...p.dietaryAttributes] }))
}

function nextId(): string {
  return `p-${String(store.length + 1).padStart(3, '0')}-${Date.now().toString(36)}`
}

// -- Typed errors -------------------------------------------------------------
// These mirror the spec's `{ error: { code, message } }` envelope so swapping
// in the real backend is a one-file change.

export class ProductApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ProductApiError'
  }
}

export class ImageInvalidError extends ProductApiError {
  constructor(message = 'Photo must be JPEG, PNG or WebP and at most 5 MB.') {
    super('IMAGE_INVALID', message)
    this.name = 'ImageInvalidError'
  }
}

export class ProductInUseError extends ProductApiError {
  constructor(message = 'This product has stock or open orders, so it cannot be deleted.') {
    super('PRODUCT_IN_USE', message)
    this.name = 'ProductInUseError'
  }
}

// -- Read ---------------------------------------------------------------------

export async function listProducts(): Promise<Product[]> {
  await delay()
  return snapshot()
}

export async function getProduct(id: string): Promise<Product | null> {
  await delay()
  const found = store.find((p) => p.id === id)
  return found ? { ...found, dietaryAttributes: [...found.dietaryAttributes] } : null
}

// -- Mutations ----------------------------------------------------------------

function toEntity(input: ProductInput, prev?: Product): Product {
  // The photo's data URL is stored as the imageKey for the mock; the real backend
  // would replace it with an object-storage key after resize.
  const imageKey = input.photo ? input.photo.dataUrl : (prev?.imageKey ?? null)
  return {
    id: prev?.id ?? nextId(),
    sku: input.sku.trim(),
    name: input.name.trim(),
    category: input.category,
    typeCode: input.typeCode,
    dietaryAttributes: [...input.dietaryAttributes],
    priceAmount: input.priceAmount,
    purchaseCostAmount: input.purchaseCostAmount,
    shelfLifeDays: input.category === 'duty_free' ? null : input.shelfLifeDays,
    isPremium: input.isPremium,
    isActive: input.isActive,
    imageKey,
    description: prev?.description ?? null,
  }
}

export async function createProduct(input: ProductInput): Promise<Product> {
  await delay()
  const created = toEntity(input)
  store.push(created)
  return { ...created, dietaryAttributes: [...created.dietaryAttributes] }
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  await delay()
  const idx = store.findIndex((p) => p.id === id)
  if (idx === -1) {
    throw new ProductApiError('NOT_FOUND', 'Product not found.')
  }
  const updated = toEntity(input, store[idx])
  store[idx] = updated
  return { ...updated, dietaryAttributes: [...updated.dietaryAttributes] }
}

export async function deleteProduct(id: string): Promise<void> {
  await delay()
  const idx = store.findIndex((p) => p.id === id)
  if (idx === -1) {
    throw new ProductApiError('NOT_FOUND', 'Product not found.')
  }
  if (store[idx].isInUse) {
    throw new ProductInUseError()
  }
  store.splice(idx, 1)
}

export async function setProductActive(id: string, isActive: boolean): Promise<Product> {
  await delay()
  const idx = store.findIndex((p) => p.id === id)
  if (idx === -1) {
    throw new ProductApiError('NOT_FOUND', 'Product not found.')
  }
  store[idx] = { ...store[idx], isActive }
  return { ...store[idx], dietaryAttributes: [...store[idx].dietaryAttributes] }
}
