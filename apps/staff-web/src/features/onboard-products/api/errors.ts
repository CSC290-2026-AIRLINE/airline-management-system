// Typed error classes for F12 staff-web. Each module-specific error
// extends a shared base so call sites can `instanceof ApiError` to
// detect the spec's `{ error: { code, message } }` envelope, or use
// the per-area subclass to narrow on a known code.

import { ApiError } from './client'

// -- Products -----------------------------------------------------------------

export class ProductApiError extends ApiError {
  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(code, message, status, details)
    this.name = 'ProductApiError'
  }
}

export class ImageInvalidError extends ProductApiError {
  constructor(message = 'Photo must be JPEG, PNG or WebP and at most 5 MB.', details?: Record<string, unknown>) {
    super('IMAGE_INVALID', message, 400, details)
    this.name = 'ImageInvalidError'
  }
}

export class ProductInUseError extends ProductApiError {
  constructor(message = 'This product has stock or open orders, so it cannot be deleted.', details?: Record<string, unknown>) {
    super('PRODUCT_IN_USE', message, 409, details)
    this.name = 'ProductInUseError'
  }
}

// -- Stock --------------------------------------------------------------------

export class StockApiError extends ApiError {
  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(code, message, status, details)
    this.name = 'StockApiError'
  }
}

// -- Catering orders ----------------------------------------------------------

export class CateringApiError extends ApiError {
  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(code, message, status, details)
    this.name = 'CateringApiError'
  }
}

// -- Offerings / cabin settings -----------------------------------------------

export class OfferingsApiError extends ApiError {
  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(code, message, status, details)
    this.name = 'OfferingsApiError'
  }
}

export class SettingInvalidError extends OfferingsApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('SETTING_INVALID', message, 400, details)
    this.name = 'SettingInvalidError'
  }
}

export class MealPolicyInvalidError extends OfferingsApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('MEAL_POLICY_INVALID', message, 400, details)
    this.name = 'MealPolicyInvalidError'
  }
}

// -- Flight report ------------------------------------------------------------

export class FlightReportApiError extends ApiError {
  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(code, message, status, details)
    this.name = 'FlightReportApiError'
  }
}

// -- Helper: build a typed error from a generic ApiError -----------------------

export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  return new ApiError('UNKNOWN', err instanceof Error ? err.message : String(err), 0)
}

export { ApiError }
