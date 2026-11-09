import { HttpException, HttpStatus } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'

/** Error codes the Role access, screen registry and audit log endpoints return, next to the Staff codes. */
export type AdminErrorCode =
  | 'VALIDATION_FAILED'
  | 'REASON_REQUIRED'
  | 'ROLE_NOT_FOUND'
  | 'SCREEN_NOT_ASSIGNABLE'
  | 'SCREEN_KIND_CONFLICT'
  | 'AUDIT_ENTRY_NOT_FOUND'
  | 'AUDIT_WRITE_FAILED'
  | 'FORBIDDEN'

/**
 * `{ error: { code, message, details? } }` — the same body the Staff & roles endpoints send (`StaffError`), so every
 * admin-console route fails the same way and the UI can branch on `code` instead of parsing a sentence.
 */
export class AdminError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: AdminErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, ...(details ? { details } : {}) } }, status)
    // HttpException would otherwise report "Http Exception" as the message in logs and tests.
    this.message = message
  }
}

export function roleNotFound(): AdminError {
  return new AdminError(HttpStatus.NOT_FOUND, 'ROLE_NOT_FOUND', 'This role does not exist.')
}

export function auditEntryNotFound(): AdminError {
  return new AdminError(HttpStatus.NOT_FOUND, 'AUDIT_ENTRY_NOT_FOUND', 'This audit entry does not exist.')
}

/** class-validator failures → `REASON_REQUIRED` when the reason is what failed, else `VALIDATION_FAILED` with the fields. */
export function toAdminValidationError(errors: ValidationError[]): AdminError {
  if (errors.some((e) => e.property === 'reason')) {
    return new AdminError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', 'A reason of at least 10 characters is required.')
  }
  const fields = Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]))
  return new AdminError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Some fields are missing or invalid.', { fields })
}
