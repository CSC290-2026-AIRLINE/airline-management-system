import { ApiErrorException } from '../../common/api-error'
import type { F12Cabin, F12DietaryAttribute, F12ProductCategory, F12SpecialMealCode } from '../../common/mapping'

const ALLOWED_CATEGORIES: F12ProductCategory[] = ['meal', 'snack', 'beverage', 'duty_free']
const ALLOWED_TYPE_CODES: F12SpecialMealCode[] = ['STD', 'VGML', 'MOML', 'KSML', 'DBML', 'GFML']
const ALLOWED_DIETARY: F12DietaryAttribute[] = ['halal', 'vegetarian', 'vegan', 'kosher', 'diabetic', 'gluten_free']
const ALLOWED_CABINS: F12Cabin[] = ['economy', 'premium_economy', 'business', 'first']

// Only JPEG, PNG and WebP up to 5 MB. Base64 body comes in as a
// data URL: "data:<mime>;base64,<...>" — we only need the prefix and
// the decoded size.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

export interface ProductDraft {
  name: string
  sku: string
  category: F12ProductCategory
  typeCode: F12SpecialMealCode
  dietaryAttributes: F12DietaryAttribute[]
  priceAmount: number
  purchaseCostAmount: number | null
  shelfLifeDays: number | null
  isPremium: boolean
  isActive: boolean
  photo: { dataUrl: string; fileName: string } | null
}

export function parseProductDraft(body: unknown): ProductDraft {
  if (!isRecord(body)) throw new ApiErrorException('LINE_INVALID', 'Body must be a JSON object.', 400)
  const name = stringField(body, 'name')
  if (name.length < 2 || name.length > 120) {
    throw new ApiErrorException('LINE_INVALID', 'name must be 2-120 characters.', 400)
  }
  const sku = stringField(body, 'sku').toUpperCase()
  if (!/^[A-Z0-9-]{2,32}$/.test(sku)) {
    throw new ApiErrorException('LINE_INVALID', 'sku must be 2-32 chars, A-Z/0-9/- only.', 400)
  }
  const category = enumField(body, 'category', ALLOWED_CATEGORIES, 'category')
  const typeCode = enumField(body, 'typeCode', ALLOWED_TYPE_CODES, 'typeCode')
  const dietary = arrayField(body, 'dietaryAttributes', ALLOWED_DIETARY, 'dietaryAttributes')
  const priceAmount = numberField(body, 'priceAmount', { min: 0 })
  const purchaseCostAmount = nullableNumberField(body, 'purchaseCostAmount', { min: 0 })
  const shelfLifeDays = nullableIntegerField(body, 'shelfLifeDays', { min: 1, max: 3650 })
  const isPremium = boolField(body, 'isPremium')
  const isActive = boolField(body, 'isActive', true)
  const photo = parsePhoto(body.photo)
  return {
    name: name.trim(),
    sku,
    category,
    typeCode,
    dietaryAttributes: dietary,
    priceAmount,
    purchaseCostAmount,
    shelfLifeDays,
    isPremium,
    isActive,
    photo,
  }
}

export function parseProductPatch(body: unknown): Partial<ProductDraft> {
  if (!isRecord(body)) throw new ApiErrorException('LINE_INVALID', 'Body must be a JSON object.', 400)
  const out: Partial<ProductDraft> = {}
  if (body.name !== undefined) {
    const name = stringField(body, 'name')
    if (name.length < 2 || name.length > 120) {
      throw new ApiErrorException('LINE_INVALID', 'name must be 2-120 characters.', 400)
    }
    out.name = name.trim()
  }
  if (body.sku !== undefined) {
    const sku = stringField(body, 'sku').toUpperCase()
    if (!/^[A-Z0-9-]{2,32}$/.test(sku)) {
      throw new ApiErrorException('LINE_INVALID', 'sku must be 2-32 chars, A-Z/0-9/- only.', 400)
    }
    out.sku = sku
  }
  if (body.category !== undefined) out.category = enumField(body, 'category', ALLOWED_CATEGORIES, 'category')
  if (body.typeCode !== undefined) out.typeCode = enumField(body, 'typeCode', ALLOWED_TYPE_CODES, 'typeCode')
  if (body.dietaryAttributes !== undefined) {
    out.dietaryAttributes = arrayField(body, 'dietaryAttributes', ALLOWED_DIETARY, 'dietaryAttributes')
  }
  if (body.priceAmount !== undefined) out.priceAmount = numberField(body, 'priceAmount', { min: 0 })
  if (body.purchaseCostAmount !== undefined) {
    out.purchaseCostAmount = nullableNumberField(body, 'purchaseCostAmount', { min: 0 })
  }
  if (body.shelfLifeDays !== undefined) {
    out.shelfLifeDays = nullableIntegerField(body, 'shelfLifeDays', { min: 1, max: 3650 })
  }
  if (body.isPremium !== undefined) out.isPremium = boolField(body, 'isPremium')
  if (body.isActive !== undefined) out.isActive = boolField(body, 'isActive')
  if (body.photo !== undefined) out.photo = parsePhoto(body.photo)
  return out
}

export function parseOfferingScope(body: unknown): {
  scope: 'network' | 'route' | 'flight'
  routeId?: string
  flightId?: string
  cabin: F12Cabin
} {
  if (!isRecord(body)) throw new ApiErrorException('LINE_INVALID', 'Body must be a JSON object.', 400)
  const scope = enumField(body, 'scope', ['network', 'route', 'flight'] as const, 'scope')
  const cabin = enumField(body, 'cabin', ALLOWED_CABINS, 'cabin')
  if (scope === 'route' && typeof body.routeId !== 'string') {
    throw new ApiErrorException('LINE_INVALID', 'routeId is required when scope=route.', 400)
  }
  if (scope === 'flight' && typeof body.flightId !== 'string') {
    throw new ApiErrorException('LINE_INVALID', 'flightId is required when scope=flight.', 400)
  }
  return {
    scope,
    cabin,
    ...(scope === 'route' ? { routeId: body.routeId as string } : {}),
    ...(scope === 'flight' ? { flightId: body.flightId as string } : {}),
  }
}

function parsePhoto(value: unknown): { dataUrl: string; fileName: string } | null {
  if (value == null) return null
  if (!isRecord(value)) throw new ApiErrorException('IMAGE_INVALID', 'photo must be an object.', 400)
  const dataUrl = stringField(value, 'dataUrl')
  const fileName = stringField(value, 'fileName')
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new ApiErrorException('IMAGE_INVALID', 'photo.dataUrl must be a base64 data URL.', 400)
  const mime = match[1].toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    throw new ApiErrorException('IMAGE_INVALID', 'photo must be JPEG, PNG, or WebP.', 400)
  }
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    throw new ApiErrorException('IMAGE_INVALID', 'photo must be 1 byte - 5 MB.', 400)
  }
  return { dataUrl, fileName }
}

export function parseOfferingToggle(body: unknown): { isActive?: boolean; isDefault?: boolean } {
  if (!isRecord(body)) throw new ApiErrorException('LINE_INVALID', 'Body must be a JSON object.', 400)
  const out: { isActive?: boolean; isDefault?: boolean } = {}
  if (body.isActive !== undefined) out.isActive = boolField(body, 'isActive')
  if (body.isDefault !== undefined) out.isDefault = boolField(body, 'isDefault')
  if (out.isActive === undefined && out.isDefault === undefined) {
    throw new ApiErrorException('LINE_INVALID', 'At least one of isActive or isDefault is required.', 400)
  }
  return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  if (typeof v !== 'string') throw new ApiErrorException('LINE_INVALID', `${key} must be a string.`, 400)
  return v
}

function numberField(obj: Record<string, unknown>, key: string, opts: { min?: number; max?: number; integer?: boolean }): number {
  const v = obj[key]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) throw new ApiErrorException('LINE_INVALID', `${key} must be a number.`, 400)
  if (opts.integer && !Number.isInteger(n)) {
    throw new ApiErrorException('LINE_INVALID', `${key} must be an integer.`, 400)
  }
  if (opts.min != null && n < opts.min) {
    throw new ApiErrorException('LINE_INVALID', `${key} must be >= ${opts.min}.`, 400)
  }
  if (opts.max != null && n > opts.max) {
    throw new ApiErrorException('LINE_INVALID', `${key} must be <= ${opts.max}.`, 400)
  }
  return n
}

function nullableNumberField(obj: Record<string, unknown>, key: string, opts: { min?: number; max?: number }): number | null {
  const v = obj[key]
  if (v == null) return null
  return numberField(obj, key, opts)
}

function nullableIntegerField(obj: Record<string, unknown>, key: string, opts: { min?: number; max?: number }): number | null {
  const v = obj[key]
  if (v == null) return null
  return numberField(obj, key, { ...opts, integer: true })
}

function boolField(obj: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = obj[key]
  if (v === undefined) return fallback
  if (typeof v !== 'boolean') throw new ApiErrorException('LINE_INVALID', `${key} must be a boolean.`, 400)
  return v
}

function arrayField<T extends string>(obj: Record<string, unknown>, key: string, allowed: readonly T[], label: string): T[] {
  const v = obj[key]
  if (!Array.isArray(v)) throw new ApiErrorException('LINE_INVALID', `${key} must be an array.`, 400)
  return v.map((x) => {
    if (typeof x !== 'string' || !(allowed as readonly string[]).includes(x)) {
      throw new ApiErrorException('LINE_INVALID', `${label} contains invalid value "${String(x)}".`, 400)
    }
    return x as T
  })
}

function enumField<T extends string>(obj: Record<string, unknown>, key: string, allowed: readonly T[], label: string): T {
  const v = obj[key]
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new ApiErrorException('LINE_INVALID', `${label} must be one of ${allowed.join(', ')}.`, 400)
  }
  return v as T
}
