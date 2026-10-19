// Spec-mandated error envelope: { error: { code, message, details? } }.
// Thrown via the global filter, returned as 4xx/5xx with the matching
// HTTP status (ApiError carries its own status so the filter does not
// need a switch statement on code).

import { HttpException } from '@nestjs/common'

export const F12_ERROR_CODES = [
  // Auth + transport codes (used by the F12 exception filter's
  // defaultCodeForStatus() when it sees a generic HttpException).
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'CONFLICT',
  'INTERNAL_ERROR',
  // Spec-mandated domain codes.
  'REPORT_MISMATCH',
  'REPORT_ALREADY_SUBMITTED',
  'REPORT_INVALID',
  'PRODUCT_NOT_OFFERED',
  'NOT_FOUND',
  'BATCH_EXPIRED',
  'STOCK_SHORTFALL',
  'ORDER_NOT_YET_DUE',
  'EMPTY_RECEIPT',
  'SUPPLIER_INVALID',
  'LINE_INVALID',
  'DUPLICATE_PRODUCT',
  'ADJUST_INVALID',
  'REASON_REQUIRED',
  'ADJUST_BELOW_RESERVED',
  'BATCH_SHORT',
  'WAREHOUSE_INVALID',
  'WAREHOUSE_DUPLICATE',
  'WAREHOUSE_IN_USE',
  'SUPPLIER_DUPLICATE',
  'MEAL_POLICY_INVALID',
  'SETTING_INVALID',
  'CATERING_VOID',
  'CATERING_CLOSED',
  'IMAGE_INVALID',
  'PRODUCT_IN_USE',
  'NO_WAREHOUSE_FOR_AIRPORT',
] as const

export type F12ErrorCode = (typeof F12_ERROR_CODES)[number]

export interface F12ApiError {
  code: F12ErrorCode
  message: string
  details?: Record<string, unknown>
}

export class ApiErrorException extends HttpException {
  constructor(code: F12ErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super({ error: { code, message, ...(details ? { details } : {}) } }, status)
  }
}
